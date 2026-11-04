import { roundSellingPriceLine } from "@/features/product-price-rounding/rounding";
import { resolveTransactionCustomPrice } from "@/features/pos-checkout/helpers/transaction-custom-price";
import { resolveCustomerManualPrice } from "@/features/pos-checkout/helpers/customer-manual-price";
import { getPriceRoundingSettings } from "@/features/product-price-rounding/server/rounding-settings";
import { getSpecialPricingEnabled } from "@/features/customer-category-pricing/server/special-pricing-settings";
import { discountedLineSubtotal } from "@/features/pos-checkout/helpers/item-discount";
import { loadProductBaseCosts } from "@/features/customer-category-pricing/helpers/base-cost";
import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { AuthError, requireRole, handleAuthError } from "@/lib/rbac/guard";
import { canRolePerformAction } from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import type { Role } from "@/lib/rbac/permissions";
import { buildOfflineSyncDecision } from "@/lib/offline/offline-sync-core";
import { allocateOfflineStock } from "./stock-allocation";
import { applyProductStockDeltas } from "@/features/product-stock-groups/stock-mutations";
import { buildTransactionStockJournal } from "@/features/transactions-stock/helpers/transaction-stock-journal";
import { compactJakartaDateKey, jakartaDateKey, parseDocumentSequence, requiresInvoiceDateReason, resolveInvoiceDateTime } from "@/features/invoice-date/helpers/invoice-date-core";
import { buildCustomerUpdateArgs } from "@/features/pos-checkout/post-commit";
import {
  PRICING_PREFERENCES,
  priceProductForCustomerType,
  canEditCustomPriceForCustomer,
  type AppliedCategoryPricing,
  type CategoryPricingRule,
  type CustomerType,
} from "@/features/customer-category-pricing/helpers/pricing-rules";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:offline-sync:transactions");
class OfflineShiftConflict extends Error {}
export const dynamic = "force-dynamic";

const offlineItemSchema = z.object({
  productId: z.string(),
  categoryId: z.string().optional(),
  name: z.string(),
  size: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  price: z.number().min(0),
  transactionPrice: z.number().positive().optional().nullable(),
  customerManualPrice: z.number().finite().min(0).max(9_999_999_999.99).optional().nullable(),
  discount: z.number().finite().min(0).optional().default(0),
  quantity: z.number().min(1),
});

const offlineTransactionSchema = z.object({
  clientMutationId: z.string().min(1),
  originCashierId: z.string().min(1).optional(),
  originStoreId: z.string().min(1).optional(),
  shiftId: z.string().min(1).nullable().optional(),
  createdAt: z.string().datetime(),
  timeSource: z.enum(["SERVER_ESTIMATE", "DEVICE_UNVERIFIED"]).optional(),
  items: z.array(offlineItemSchema).min(1),
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER", "TEMPO"]),
  amountPaid: z.number().min(0),
  payments: z.array(z.object({
    method: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]),
    amount: z.number().min(0),
  })).optional(),
  discount: z.number().min(0).default(0),
  taxRate: z.number().min(0).max(100).multipleOf(0.01).optional().default(0),
  note: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  pricingPreference: z.enum(PRICING_PREFERENCES).optional().default("SPECIAL"),
  priceRoundingSettings: z.object({
    enabled: z.boolean(), increment: z.number().int().min(1).max(1_000_000_000),
    threshold: z.number().int().min(0), excludedCategoryIds: z.array(z.string().min(1)).optional(),
  }).refine(settings => settings.threshold <= settings.increment).optional(),
  salesName: z.string().optional().nullable(),
  salespersonId: z.string().optional().nullable(),
  paymentStatus: z.enum(["COMPLETED", "DP"]).optional().default("COMPLETED"),
  isJobOrder: z.boolean().optional().default(false),
  estimatedDoneAt: z.string().optional().nullable(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  invoiceTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional().nullable(),
  invoiceDateReason: z.string().optional().nullable(),
  originalSubtotal: z.number().min(0),
  originalTotal: z.number().min(0),
});

const syncSchema = z.object({
  transactions: z.array(z.unknown()).min(1).max(500),
});

type TxClient = Prisma.TransactionClient;
type OfflineTransactionInput = z.infer<typeof offlineTransactionSchema>;
type ServerOfflineItem = z.infer<typeof offlineItemSchema>;
type SyncResult = {
  clientMutationId: string;
  status: string;
  serverTransactionId?: string;
  message: string;
};

export async function POST(request: Request) {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER", "SALES");
    const permissions = await getGlobalRolePermissions();
    const resource = user.role === "SALES" ? "transaction.request" : "transaction";
    if (!canRolePerformAction(user.role as Role, resource, "create", permissions)) {
      throw new AuthError(403, "Insufficient permissions");
    }
    const storeId = user.storeId || "store-main";
    const body = await request.json();
    const parsed = syncSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 },
      );
    }

    // Process each transaction independently. A failure or unique-constraint
    // race on one item MUST NOT abort the whole batch — sibling transactions
    // are already committed and the client needs per-item results so it
    // doesn't re-queue them.
    const results: SyncResult[] = [];
    for (const rawTransaction of parsed.data.transactions) {
      const item = offlineTransactionSchema.safeParse(rawTransaction);
      if (!item.success) {
        const clientMutationId = typeof rawTransaction === "object" && rawTransaction !== null &&
          "clientMutationId" in rawTransaction && typeof rawTransaction.clientMutationId === "string"
          ? rawTransaction.clientMutationId : "";
        results.push({ clientMutationId, status: "FAILED_FINAL", message: "Data transaksi tidak valid. Periksa transaksi ini." });
        continue;
      }
      const offlineTx = item.data;
      try {
        results.push(await syncOne(offlineTx, user, storeId));
      } catch (err) {
        if (err instanceof OfflineShiftConflict) {
          results.push({ clientMutationId: offlineTx.clientMutationId, status: "FAILED_FINAL", message: err.message });
          continue;
        }
        if (isPrismaUniqueConstraint(err)) {
          try {
            const winner = await db.transaction.findUnique({
              where: { offlineClientMutationId: offlineTx.clientMutationId },
              select: { id: true, status: true, storeId: true, cashierId: true, requestedById: true },
            });
            if (winner) {
              results.push(existingSyncResult(offlineTx.clientMutationId, winner, user.id, storeId));
              continue;
            }
          } catch (refetchErr) {
            log.error("[offline-sync] P2002 refetch failed:", refetchErr);
          }
        }
        log.error(
          `[offline-sync] failed for ${offlineTx.clientMutationId}:`,
          err,
        );
        results.push({
          clientMutationId: offlineTx.clientMutationId,
          status: "FAILED_RETRYABLE",
          message: "Sinkronisasi gagal sementara. Coba lagi saat koneksi tersedia.",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("[POST /api/offline-sync/transactions]", error);
    return NextResponse.json(
      { message: "Failed to sync offline transactions" },
      { status: 500 },
    );
  }
}

function existingSyncResult(
  clientMutationId: string,
  existing: { id: string; status: string; storeId: string; cashierId: string | null; requestedById: string | null },
  userId: string,
  storeId: string,
): SyncResult {
  if (existing.storeId !== storeId || (existing.cashierId !== userId && existing.requestedById !== userId)) {
    return { clientMutationId, status: "FAILED_FINAL", message: "ID transaksi digunakan oleh kasir atau toko lain. Periksa antrean ini." };
  }
  return {
    clientMutationId,
    status: existing.status === "PENDING_APPROVAL" ? "PENDING_APPROVAL" : "SYNCED",
    serverTransactionId: existing.id,
    message: "Already synced",
  };
}

// Recognise a Prisma P2002 unique-constraint error without importing the
// client types here (they live in @pos/db).
function isPrismaUniqueConstraint(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}

async function syncOne(
  offlineTx: OfflineTransactionInput,
  user: Awaited<ReturnType<typeof requireRole>>,
  storeId: string,
): Promise<SyncResult> {
  if (offlineTx.originCashierId !== user.id || offlineTx.originStoreId !== storeId) {
    return {
      clientMutationId: offlineTx.clientMutationId,
      status: "FAILED_FINAL",
      message: "Identitas kasir atau toko asal tidak cocok. Periksa transaksi ini sebelum sinkronisasi.",
    };
  }
  const existing = await db.transaction.findUnique({
    where: { offlineClientMutationId: offlineTx.clientMutationId },
    select: { id: true, status: true, storeId: true, cashierId: true, requestedById: true },
  });

  if (existing) {
    return existingSyncResult(offlineTx.clientMutationId, existing, user.id, storeId);
  }

  const capturedAt = new Date(offlineTx.createdAt);
  if (capturedAt.getTime() > Date.now()) {
    return { clientMutationId: offlineTx.clientMutationId, status: "FAILED_FINAL", message: "Waktu transaksi berada di masa depan. Periksa jam perangkat dan transaksi ini bersama pengelola." };
  }
  const hasCustomInvoiceDate = Boolean(offlineTx.invoiceDate || offlineTx.invoiceTime);
  if (hasCustomInvoiceDate && user.role !== "OWNER" && user.role !== "ADMIN") {
    return { clientMutationId: offlineTx.clientMutationId, status: "FAILED_FINAL", message: "Hanya Owner atau Admin yang boleh mengatur tanggal invoice." };
  }
  const resolvedInvoiceDate = hasCustomInvoiceDate
    ? resolveInvoiceDateTime({ mode: "create", date: offlineTx.invoiceDate ?? jakartaDateKey(capturedAt), time: offlineTx.invoiceTime, now: capturedAt })
    : capturedAt;
  if (!Number.isFinite(resolvedInvoiceDate.getTime()) ||
      (offlineTx.invoiceDate && jakartaDateKey(resolvedInvoiceDate) !== offlineTx.invoiceDate)) {
    return { clientMutationId: offlineTx.clientMutationId, status: "FAILED_FINAL", message: "Tanggal invoice tidak valid." };
  }
  if (hasCustomInvoiceDate && requiresInvoiceDateReason({ invoiceDate: resolvedInvoiceDate, now: capturedAt }) && !offlineTx.invoiceDateReason?.trim()) {
    return { clientMutationId: offlineTx.clientMutationId, status: "FAILED_FINAL", message: "Alasan wajib diisi untuk tanggal invoice beda hari." };
  }

  const isTempo = offlineTx.paymentMethod === "TEMPO";
  const submittedPayments = offlineTx.payments ?? [];
  const submittedTotal = submittedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  if ((submittedPayments.length > 0 && Math.abs(submittedTotal - offlineTx.amountPaid) > 0.01) ||
      (isTempo && (!offlineTx.customerId || offlineTx.paymentStatus === "DP" ||
        (offlineTx.amountPaid > 0 && submittedPayments.length === 0)))) {
    return { clientMutationId: offlineTx.clientMutationId, status: "FAILED_FINAL", message: "Rincian pembayaran tidak sesuai. Periksa transaksi ini." };
  }
  const resolvedPayments = submittedPayments.length > 0
    ? submittedPayments
    : isTempo ? [] : [{ method: offlineTx.paymentMethod as Exclude<typeof offlineTx.paymentMethod, "TEMPO">, amount: offlineTx.amountPaid }];

  const productIds = [...new Set(offlineTx.items.map((item) => item.productId))];
  const [products, customer, rawPricingRules] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds }, storeId, isActive: true },
      select: {
        id: true,
        name: true,
        price: true,
        costPrice: true,
        storeId: true,
        stockGroupId: true,
        unitMultiplierToBase: true,
        stockGroup: { select: { id: true, baseStock: true, baseUnit: true, storeId: true } },
        hargaDinas: true,
        hargaAgen: true,
        size: true,
        material: true,
        stock: true,
        unit: true,
        categoryId: true,
        category: { select: { name: true } },
        brandId: true,
        brand: { select: { name: true } },
      },
    }),
    offlineTx.customerId
      ? db.customer.findFirst({
          where: { id: offlineTx.customerId, storeId },
          select: { id: true, type: true },
        })
      : Promise.resolve(true),
    db.categoryCustomerPricingRule.findMany({
      where: { storeId, isActive: true },
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
      },
    }),
  ]);
  const baseCosts = await loadProductBaseCosts(db, products);
  const productById = new Map(products.map((product) => [product.id, product]));

  if (productById.size !== productIds.length) {
    return {
      clientMutationId: offlineTx.clientMutationId,
      status: "FAILED_FINAL",
      message: "One or more products were not found",
    };
  }

  if (offlineTx.customerId && !customer) {
    return {
      clientMutationId: offlineTx.clientMutationId,
      status: "FAILED_FINAL",
      message: "Customer not found",
    };
  }

  const checkoutCustomerType: CustomerType =
    offlineTx.customerId && customer && customer !== true
      ? (customer.type as CustomerType)
      : "UMUM";
  const pricingRules = rawPricingRules.map((rule) => ({
    id: rule.id,
    categoryId: rule.categoryId,
    categoryName: rule.category.name,
    customerType: (rule.customerType ?? "ALL") as CategoryPricingRule["customerType"],
    customerTypes: rule.customerTypes,
    unit: rule.unit,
    units: rule.units,
    brandId: rule.brandId,
    brandName: rule.brand?.name ?? null,
    mode: rule.mode,
    value: Number(rule.value),
    discountPercent: Number(rule.discountPercent ?? 0),
    isActive: rule.isActive,
    updatedAt: rule.updatedAt,
  })) satisfies CategoryPricingRule[];
  const appliedPricingByProductId = new Map<string, AppliedCategoryPricing | null>();
  const catalogPriceByProductId = new Map<string, number>();

  const roundingSettings = await getPriceRoundingSettings();
  const specialPricingEnabled = await getSpecialPricingEnabled();
  const pricingPermissions = await getGlobalRolePermissions();
  const canUseTransactionPrice = canRolePerformAction(user.role as Role, "transaction.custom_price", "update", pricingPermissions);
  const canUseCustomerManualPrice = specialPricingEnabled && canEditCustomPriceForCustomer(user.role, checkoutCustomerType);
  const categoryChanged = offlineTx.items.some(item => item.categoryId != null && item.categoryId !== productById.get(item.productId)?.categoryId);
  const capturedPolicy = offlineTx.priceRoundingSettings;
  const roundingPolicyChanged = Boolean(capturedPolicy && (
    capturedPolicy.enabled !== roundingSettings.enabled || capturedPolicy.increment !== roundingSettings.increment ||
    capturedPolicy.threshold !== roundingSettings.threshold ||
    new Set(capturedPolicy.excludedCategoryIds ?? []).size !== new Set(roundingSettings.excludedCategoryIds ?? []).size ||
    (capturedPolicy.excludedCategoryIds ?? []).some(id => !(roundingSettings.excludedCategoryIds ?? []).includes(id))
  ));
  const unauthorizedPrice = offlineTx.items.some(item =>
    (item.transactionPrice != null && !canUseTransactionPrice) ||
    (item.customerManualPrice != null && !canUseCustomerManualPrice) ||
    (item.customerManualPrice != null && item.transactionPrice != null));
  const serverItems: ServerOfflineItem[] = offlineTx.items.map((item) => {
    const product = productById.get(item.productId);
    if (!product) {
      throw new Error("PRODUCT_NOT_FOUND");
    }
    const automaticPrice = priceProductForCustomerType(
      {
        categoryId: product.categoryId,
        categoryName: product.category?.name ?? null,
        price: Number(product.price),
        costPrice: product.costPrice == null ? null : Number(product.costPrice),
        ...baseCosts.get(product.id),
        hargaDinas:
          product.hargaDinas == null ? null : Number(product.hargaDinas),
        hargaAgen:
          product.hargaAgen == null ? null : Number(product.hargaAgen),
        unit: product.unit,
        brandId: product.brandId,
        brandName: product.brand?.name ?? null,
      },
      checkoutCustomerType,
      pricingRules,
      offlineTx.pricingPreference,
      specialPricingEnabled,
    );
    const conflictingPrices = item.transactionPrice != null && item.customerManualPrice != null;
    const transactionPrice = canUseTransactionPrice && !conflictingPrices ? item.transactionPrice ?? null : null;
    const customerManualPrice = canUseCustomerManualPrice && !conflictingPrices ? item.customerManualPrice ?? null : null;
    const customerPrice = customerManualPrice == null ? automaticPrice : resolveCustomerManualPrice({
      pricedLine: automaticPrice, manualPrice: customerManualPrice, customerType: checkoutCustomerType,
      categoryId: product.categoryId, categoryName: product.category?.name,
    });
    const resolved = resolveTransactionCustomPrice({
      pricedLine: transactionPrice == null ? customerPrice : roundSellingPriceLine(automaticPrice, roundingSettings, product.categoryId),
      transactionPrice,
      customerType: checkoutCustomerType,
      categoryId: product.categoryId,
      categoryName: product.category?.name,
    });
    const rounded = roundSellingPriceLine(resolved, roundingSettings, product.categoryId);
    const price = rounded.unitPrice;
    const appliedPricing = rounded.appliedPricing;
    // Distinct lines of the same product can use different invoice prices.
    const snapshotKey = JSON.stringify([product.id, item.size ?? product.size ?? null, item.material ?? product.material ?? null, transactionPrice, customerManualPrice]);
    appliedPricingByProductId.set(snapshotKey, appliedPricing);
    catalogPriceByProductId.set(product.id, Number(product.price));

    return {
      productId: product.id,
      name: product.name,
      size: item.size ?? product.size ?? null,
      material: item.material ?? product.material ?? null,
      price,
      transactionPrice,
      customerManualPrice,
      quantity: item.quantity,
      discount: Math.round((Math.min(item.discount, price * item.quantity) + Number.EPSILON) * 100) / 100,
    };
  });
  const stockByProductId = allocateOfflineStock(products, serverItems);

  const subtotalFromServer = serverItems.reduce((sum, item) => sum + discountedLineSubtotal(item.price, item.quantity, item.discount), 0);
  const cappedDiscount = Math.min(offlineTx.discount ?? 0, subtotalFromServer);

  const decision = buildOfflineSyncDecision(
    {
      clientMutationId: offlineTx.clientMutationId,
      createdAt: offlineTx.createdAt,
      items: serverItems,
      discount: cappedDiscount,
      taxRate: offlineTx.taxRate,
      originalTotal: offlineTx.originalTotal,
    },
    {
      now: new Date(),
      stockByProductId,
    },
  );

  if (decision.resultStatus === "FAILED_FINAL") {
    return {
      clientMutationId: offlineTx.clientMutationId,
      status: "FAILED_FINAL",
      message: "Tidak ada item yang tersedia untuk disinkronkan",
    };
  }

  if (offlineTx.salespersonId) {
    const salesperson = await db.salesperson.findFirst({
      where: { id: offlineTx.salespersonId, storeId },
      select: { id: true },
    });
    if (!salesperson) {
      return {
        clientMutationId: offlineTx.clientMutationId,
        status: "FAILED_FINAL",
        message: "Salesperson not found",
      };
    }
  }

  const serverOfflineTx: OfflineTransactionInput = {
    ...offlineTx,
    items: serverItems,
    discount: decision.discount,
    payments: resolvedPayments,
  };
  const canAutoApprove = canRolePerformAction(
    user.role as Role,
    "transaction.auto_approve",
    "create",
    await getGlobalRolePermissions(),
  );
  const itemPricesChanged = serverItems.some((item, index) =>
    Math.round(item.price * 100) !== Math.round(offlineTx.items[index].price * 100),
  );
  const finalDecision =
    decision.transactionStatus === "COMPLETED" &&
    (!canAutoApprove || itemPricesChanged || categoryChanged || roundingPolicyChanged || unauthorizedPrice ||
      (offlineTx.paymentStatus === "DP" || isTempo
        ? offlineTx.amountPaid >= decision.total
        : offlineTx.amountPaid < decision.total))
      ? {
          ...decision,
          resultStatus: "PENDING_APPROVAL" as const,
          transactionStatus: "PENDING_APPROVAL" as const,
          reason: !canAutoApprove
            ? "AUTO_APPROVAL_REQUIRED" as const
            : itemPricesChanged || categoryChanged || roundingPolicyChanged || unauthorizedPrice
              ? "ITEM_PRICE_CHANGED" as const
            : "ADJUSTED_TOTAL_CHANGED" as const,
        }
      : decision;

  const created = await createSyncedTransaction({
    txData: serverOfflineTx,
    originalTxData: offlineTx,
    decision: finalDecision,
    user,
    storeId,
    appliedPricingByProductId,
    catalogPriceByProductId,
    resolvedInvoiceDate,
  });

  return {
    clientMutationId: offlineTx.clientMutationId,
    status: finalDecision.resultStatus,
    serverTransactionId: created.id,
    message:
      finalDecision.resultStatus === "PENDING_APPROVAL"
        ? "Synced as pending approval"
        : "Synced",
  };
}

async function createSyncedTransaction({
  txData,
  originalTxData,
  decision,
  user,
  storeId,
  appliedPricingByProductId,
  catalogPriceByProductId,
  resolvedInvoiceDate,
}: {
  txData: OfflineTransactionInput;
  originalTxData: OfflineTransactionInput;
  decision: ReturnType<typeof buildOfflineSyncDecision>;
  user: Awaited<ReturnType<typeof requireRole>>;
  storeId: string;
  appliedPricingByProductId: Map<string, AppliedCategoryPricing | null>;
  catalogPriceByProductId: Map<string, number>;
  resolvedInvoiceDate: Date;
}) {
  const dateStr = compactJakartaDateKey(resolvedInvoiceDate);
  const invoicePrefix = `INV-${dateStr}-`;
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await db.$transaction(async (tx: TxClient) => {
        if (txData.shiftId) {
          const locked = await tx.cashierShift.updateMany({
            where: { id: txData.shiftId, cashierId: user.id, storeId, status: "OPEN", openedAt: { lte: new Date(txData.createdAt) } },
            data: { pausedDurationSeconds: { increment: 0 } },
          });
          if (locked.count !== 1) throw new OfflineShiftConflict("Shift asal transaksi sudah ditutup atau tidak tersedia. Periksa antrean bersama pengelola.");
        } else {
          // Older queue entries do not carry a shift ID. A sale still affects
          // the store-wide cash summary, so protect a matching shift as well.
          const capturedAt = new Date(txData.createdAt);
          const matchingShift = await tx.cashierShift.findFirst({
            where: { storeId, openedAt: { lte: capturedAt }, OR: [
              { status: "OPEN" }, { status: "CLOSED", closedAt: { gte: capturedAt } },
            ] },
            orderBy: { openedAt: "desc" },
            select: { id: true, status: true },
          });
          if (matchingShift?.status === "CLOSED") throw new OfflineShiftConflict("Shift pada waktu transaksi sudah ditutup. Periksa antrean bersama pengelola.");
          if (matchingShift) {
            const locked = await tx.cashierShift.updateMany({
              where: { id: matchingShift.id, storeId, status: "OPEN" },
              data: { pausedDurationSeconds: { increment: 0 } },
            });
            if (locked.count !== 1) throw new OfflineShiftConflict("Shift pada waktu transaksi sudah ditutup. Periksa antrean bersama pengelola.");
          }
        }
        const isPendingApproval = decision.transactionStatus === "PENDING_APPROVAL";
        const amountPaid = txData.amountPaid;
        const isTempo = txData.paymentMethod === "TEMPO";
        const isDP = txData.paymentStatus === "DP";
        const payments = txData.payments ?? [];
        const customerUpdate = !isPendingApproval ? buildCustomerUpdateArgs({
          customerId: txData.customerId || null, isDP: isDP || isTempo,
          total: decision.total, amountPaid,
        }) : null;
        if (customerUpdate) await tx.customer.update(customerUpdate);
        const paymentMethod = isTempo ? "TEMPO" : payments.reduce(
          (primary, payment) => payment.amount > primary.amount ? payment : primary,
          payments[0] ?? { method: "CASH" as const, amount: 0 },
        ).method;
        // The invoice key is globally unique and independent of captured createdAt.
        const invoices = await tx.transaction.findMany({
          where: { invoiceNumber: { startsWith: invoicePrefix } },
          select: { invoiceNumber: true },
        });
        const highestSequence = invoices.reduce(
          (highest, row) => Math.max(highest, parseDocumentSequence(row.invoiceNumber) ?? 0),
          0,
        );
        const invoiceNumber = `${invoicePrefix}${String(highestSequence + 1 + attempt).padStart(4, "0")}`;

        const transaction = await tx.transaction.create({
          data: {
            invoiceNumber,
            storeId,
            cashierId: isPendingApproval ? null : user.id,
            requestedById: isPendingApproval ? user.id : null,
            customerId: txData.customerId || null,
            subtotal: decision.subtotal,
            discount: decision.discount,
            tax: decision.tax,
            taxRate: txData.taxRate,
            taxMethod: "STANDARD",
            total: decision.total,
            paymentMethod,
            amountPaid,
            change: isPendingApproval || isDP || isTempo ? 0 : Math.max(0, amountPaid - decision.total),
            status: isPendingApproval ? "PENDING_APPROVAL" : isDP ? "DP" : "COMPLETED",
            note: buildOfflineNote(txData.note, decision),
            customerName: txData.customerName || null,
            salesName: txData.salesName || null,
            salespersonId: txData.salespersonId || null,
            isJobOrder: txData.isJobOrder,
            productionStatus: txData.isJobOrder ? "PRINTING" : null,
            estimatedDoneAt: txData.estimatedDoneAt ? new Date(txData.estimatedDoneAt) : null,
            offlineClientMutationId: txData.clientMutationId,
            offlineOriginalPayload: originalTxData as Prisma.JsonObject,
            offlineSyncMetadata: {
              reason: decision.reason,
              removedItems: decision.removedItems,
              originalTotal: txData.originalTotal,
              adjustedTotal: decision.total,
              timeSource: txData.timeSource ?? "DEVICE_UNVERIFIED",
            } as Prisma.JsonObject,
            invoiceDate: resolvedInvoiceDate,
            createdAt: new Date(txData.createdAt),
            ...(payments.length ? { payments: { create: payments } } : {}),
            items: {
              create: decision.items.map((item) => {
                const appliedPricing =
                  appliedPricingByProductId.get(JSON.stringify([item.productId, item.size ?? null, item.material ?? null, item.transactionPrice ?? null, item.customerManualPrice ?? null])) ?? null;
                return {
                  productId: item.productId,
                  productName: item.name,
                  size: item.size || null,
                  material: item.material || null,
                  quantity: item.quantity,
                  unitPrice: item.price,
                  discount: item.discount ?? 0,
                  subtotal: discountedLineSubtotal(item.price, item.quantity, item.discount),
                  pricingRuleId: appliedPricing?.ruleId ?? null,
                  pricingCustomerType: appliedPricing?.customerType ?? null,
                  pricingCategoryId: appliedPricing?.categoryId ?? null,
                  pricingCategoryName: appliedPricing?.categoryName ?? null,
                  pricingMode: appliedPricing?.mode ?? null,
                  pricingValue: appliedPricing?.value ?? null,
                  pricingDiscountPercent: appliedPricing?.discountPercent ?? null,
                  pricingUnit: appliedPricing?.unit ?? null,
                  pricingBrandId: appliedPricing?.brandId ?? null,
                  pricingBrandName: appliedPricing?.brandName ?? null,
                  originalUnitPrice:
                    appliedPricing?.originalUnitPrice ??
                    catalogPriceByProductId.get(item.productId) ??
                    item.price,
                  appliedUnitPrice: item.price,
                };
              }),
            },
          },
          include: { items: true },
        });

        if (!isPendingApproval) {
          const stockMovements = await applyProductStockDeltas(tx, {
            storeId,
            items: decision.items.map((item) => ({
              productId: item.productId,
              delta: -item.quantity,
            })),
          });

          const productIds = decision.items.map((item) => item.productId);
          const productCosts = await tx.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, costPrice: true },
          });
          const costById = new Map(
            productCosts.map((p) => [
              p.id,
              p.costPrice === null ? null : Number(p.costPrice.toString()),
            ]),
          );

          await tx.inventoryLog.createMany({
            data: buildTransactionStockJournal({
              transactionId: transaction.id,
              inventoryRows: decision.items.map((item) => ({
                productId: item.productId,
                type: "OUT",
                reason: "SALE",
                quantity: item.quantity,
                unitCost: costById.get(item.productId) ?? null,
                note: `Offline sync ${invoiceNumber}`,
                createdBy: user.id,
                person: user.name,
              })),
              stockMovements,
            }),
          });
        }

        return transaction;
      });
    } catch (error) {
      const failure = error as { code?: string; meta?: { target?: string | string[] } } | null;
      const target = failure?.meta?.target;
      const invoiceCollision = failure?.code === "P2002" &&
        (Array.isArray(target) ? target.includes("invoiceNumber") : target?.includes("invoiceNumber"));
      if (!invoiceCollision || attempt === maxAttempts - 1) throw error;
    }
  }
  throw new Error("Nomor invoice belum dapat dibuat. Silakan coba sinkronisasi kembali.");
}

function buildOfflineNote(
  note: string | null | undefined,
  decision: ReturnType<typeof buildOfflineSyncDecision>,
) {
  const auditNote = `Offline sync: ${decision.reason}`;
  return note ? `${note} | ${auditNote}` : auditNote;
}
