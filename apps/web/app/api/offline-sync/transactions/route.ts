import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { buildOfflineSyncDecision } from "@/lib/offline/offline-sync-core";
import { applyProductStockDeltas } from "@/features/product-stock-groups/stock-mutations";
import {
  PRICING_PREFERENCES,
  priceProductForCustomerType,
  type AppliedCategoryPricing,
  type CategoryPricingRule,
  type CustomerType,
} from "@/features/customer-category-pricing/helpers/pricing-rules";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:offline-sync:transactions");
export const dynamic = "force-dynamic";

const offlineItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  size: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  price: z.number().min(0),
  transactionPrice: z.number().positive().optional().nullable(),
  quantity: z.number().min(1),
});

const offlineTransactionSchema = z.object({
  clientMutationId: z.string().min(1),
  createdAt: z.string().datetime(),
  items: z.array(offlineItemSchema).min(1),
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]),
  amountPaid: z.number().min(0),
  discount: z.number().min(0).default(0),
  note: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  pricingPreference: z.enum(PRICING_PREFERENCES).optional().default("SPECIAL"),
  salesName: z.string().optional().nullable(),
  salespersonId: z.string().optional().nullable(),
  paymentStatus: z.string().optional().default("COMPLETED"),
  isJobOrder: z.boolean().optional().default(false),
  estimatedDoneAt: z.string().optional().nullable(),
  originalSubtotal: z.number().min(0),
  originalTotal: z.number().min(0),
});

const syncSchema = z.object({
  transactions: z.array(offlineTransactionSchema).min(1).max(500),
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
    const user = await requirePermission("transaction", "create");
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
    for (const offlineTx of parsed.data.transactions) {
      try {
        results.push(await syncOne(offlineTx, user, storeId));
      } catch (err) {
        if (isPrismaUniqueConstraint(err)) {
          try {
            const winner = await db.transaction.findUnique({
              where: { offlineClientMutationId: offlineTx.clientMutationId },
              select: { id: true, status: true },
            });
            if (winner) {
              results.push({
                clientMutationId: offlineTx.clientMutationId,
                status: winner.status === "PENDING_APPROVAL" ? "PENDING_APPROVAL" : "SYNCED",
                serverTransactionId: winner.id,
                message: "Already synced",
              });
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
          status: "FAILED_FINAL",
          message: err instanceof Error ? err.message : "Sync failed",
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
  user: Awaited<ReturnType<typeof requirePermission>>,
  storeId: string,
): Promise<SyncResult> {
  const existing = await db.transaction.findUnique({
    where: { offlineClientMutationId: offlineTx.clientMutationId },
    select: { id: true, status: true },
  });

  if (existing) {
    return {
      clientMutationId: offlineTx.clientMutationId,
      status: existing.status === "PENDING_APPROVAL" ? "PENDING_APPROVAL" : "SYNCED",
      serverTransactionId: existing.id,
      message: "Already synced",
    };
  }

  const productIds = [...new Set(offlineTx.items.map((item) => item.productId))];
  const [products, customer, rawPricingRules] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds }, storeId, isActive: true },
      select: {
        id: true,
        name: true,
        price: true,
        costPrice: true,
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
    unit: rule.unit,
    brandId: rule.brandId,
    brandName: rule.brand?.name ?? null,
    mode: rule.mode,
    value: Number(rule.value),
    isActive: rule.isActive,
    updatedAt: rule.updatedAt,
  })) satisfies CategoryPricingRule[];
  const appliedPricingByProductId = new Map<string, AppliedCategoryPricing | null>();
  const catalogPriceByProductId = new Map<string, number>();

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
    );
    const price = item.transactionPrice ?? automaticPrice.unitPrice;
    const appliedPricing = automaticPrice.appliedPricing
      ? {
          ...automaticPrice.appliedPricing,
          appliedUnitPrice: price,
        }
      : null;
    appliedPricingByProductId.set(product.id, appliedPricing);
    catalogPriceByProductId.set(product.id, Number(product.price));

    return {
      productId: product.id,
      name: product.name,
      size: item.size ?? product.size ?? null,
      material: item.material ?? product.material ?? null,
      price,
      transactionPrice: item.transactionPrice,
      quantity: item.quantity,
    };
  });
  const stockByProductId = new Map(products.map((product) => [product.id, product.stock]));

  const subtotalFromServer = serverItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const cappedDiscount = Math.min(offlineTx.discount ?? 0, subtotalFromServer);

  const decision = buildOfflineSyncDecision(
    {
      clientMutationId: offlineTx.clientMutationId,
      createdAt: offlineTx.createdAt,
      items: serverItems,
      discount: cappedDiscount,
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
  };
  const finalDecision =
    decision.transactionStatus === "COMPLETED" && offlineTx.amountPaid < decision.total
      ? {
          ...decision,
          resultStatus: "PENDING_APPROVAL" as const,
          transactionStatus: "PENDING_APPROVAL" as const,
          reason: "ADJUSTED_TOTAL_CHANGED" as const,
        }
      : decision;

  const created = await createSyncedTransaction({
    txData: serverOfflineTx,
    decision: finalDecision,
    user,
    storeId,
    appliedPricingByProductId,
    catalogPriceByProductId,
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
  decision,
  user,
  storeId,
  appliedPricingByProductId,
  catalogPriceByProductId,
}: {
  txData: OfflineTransactionInput;
  decision: ReturnType<typeof buildOfflineSyncDecision>;
  user: Awaited<ReturnType<typeof requirePermission>>;
  storeId: string;
  appliedPricingByProductId: Map<string, AppliedCategoryPricing | null>;
  catalogPriceByProductId: Map<string, number>;
}) {
  return db.$transaction(async (tx: TxClient) => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const count = await tx.transaction.count({
      where: { storeId, createdAt: { gte: dayStart } },
    });
    const invoiceNumber = `INV-${dateStr}-${String(count + 1).padStart(4, "0")}`;
    const isPendingApproval = decision.transactionStatus === "PENDING_APPROVAL";
    const amountPaid = isPendingApproval ? 0 : Math.min(txData.amountPaid, decision.total);

    const transaction = await tx.transaction.create({
      data: {
        invoiceNumber,
        storeId,
        cashierId: user.role === "SALES" || isPendingApproval ? null : user.id,
        requestedById: user.role === "SALES" || isPendingApproval ? user.id : null,
        customerId: txData.customerId || null,
        subtotal: decision.subtotal,
        discount: txData.discount,
        tax: 0,
        total: decision.total,
        paymentMethod: txData.paymentMethod,
        amountPaid,
        change: isPendingApproval ? 0 : Math.max(0, amountPaid - decision.total),
        status: decision.transactionStatus || "PENDING_APPROVAL",
        note: buildOfflineNote(txData.note, decision),
        customerName: txData.customerName || null,
        salesName: txData.salesName || null,
        salespersonId: txData.salespersonId || null,
        isJobOrder: txData.isJobOrder,
        productionStatus: txData.isJobOrder ? "PRINTING" : null,
        estimatedDoneAt: txData.estimatedDoneAt ? new Date(txData.estimatedDoneAt) : null,
        offlineClientMutationId: txData.clientMutationId,
        offlineOriginalPayload: txData as Prisma.JsonObject,
        offlineSyncMetadata: {
          reason: decision.reason,
          removedItems: decision.removedItems,
          originalTotal: txData.originalTotal,
          adjustedTotal: decision.total,
        } as Prisma.JsonObject,
        items: {
          create: decision.items.map((item) => {
            const appliedPricing =
              appliedPricingByProductId.get(item.productId) ?? null;
            return {
              productId: item.productId,
              productName: item.name,
              size: item.size || null,
              material: item.material || null,
              quantity: item.quantity,
              unitPrice: item.price,
              discount: 0,
              subtotal: item.price * item.quantity,
              pricingRuleId: appliedPricing?.ruleId ?? null,
              pricingCustomerType: appliedPricing?.customerType ?? null,
              pricingCategoryId: appliedPricing?.categoryId ?? null,
              pricingCategoryName: appliedPricing?.categoryName ?? null,
              pricingMode: appliedPricing?.mode ?? null,
              pricingValue: appliedPricing?.value ?? null,
              pricingUnit: appliedPricing?.unit ?? null,
              pricingBrandId: appliedPricing?.brandId ?? null,
              pricingBrandName: appliedPricing?.brandName ?? null,
              originalUnitPrice:
                appliedPricing?.originalUnitPrice ??
                catalogPriceByProductId.get(item.productId) ??
                item.price,
              appliedUnitPrice: appliedPricing?.appliedUnitPrice ?? item.price,
            };
          }),
        },
      },
      include: { items: true },
    });

    if (!isPendingApproval) {
      await applyProductStockDeltas(tx, {
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
        data: decision.items.map((item) => ({
          productId: item.productId,
          type: "OUT",
          reason: "SALE",
          quantity: item.quantity,
          unitCost: costById.get(item.productId) ?? null,
          note: `Offline sync ${invoiceNumber}`,
          createdBy: user.id,
          person: user.name,
        })),
      });
    }

    return transaction;
  });
}

function buildOfflineNote(
  note: string | null | undefined,
  decision: ReturnType<typeof buildOfflineSyncDecision>,
) {
  const auditNote = `Offline sync: ${decision.reason}`;
  return note ? `${note} | ${auditNote}` : auditNote;
}
