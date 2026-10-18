import { getInvoiceNow } from "@/features/invoice-date/services/internet-clock";
import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import {
  AuthError,
  handleAuthError,
  requirePermission,
} from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import {
  compactJakartaDateKey,
  jakartaDateKey,
  requiresInvoiceDateReason,
  resolveInvoiceDateTime,
} from "@/features/invoice-date/helpers/invoice-date-core";
import { buildCustomerUpdateArgs } from "@/features/pos-checkout/post-commit";
import { buildServiceMaterialInventoryLogRows, type InventoryLogRow } from "@/features/pos-checkout/post-commit";
import { buildDefaultRolePermissions, canRolePerformAction } from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import {
  buildApprovalQuote,
  type ApprovalItemInput,
  type ApprovalQuote,
} from "@/features/transactions-draft/services/approval-quote";
import { buildTransactionStockJournal } from "@/features/transactions-stock/helpers/transaction-stock-journal";
import { getTransactionTaxMethod } from "@/features/transaction-tax/helpers/tax-calculation";
import {
  applyProductStockDeltas,
  StockMutationError,
} from "@/features/product-stock-groups/stock-mutations";

const log = getLogger("api:transactions:approve-draft");

export const dynamic = "force-dynamic";

const approveDraftSchema = z.object({
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER", "TEMPO"]),
  amountPaid: z.number().min(0),
  payments: z.array(z.object({
    method: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]),
    amount: z.number().positive(),
  })).optional(),
  items: z.array(z.object({
    productId: z.string().nullable().optional(),
    printingServiceId: z.string().nullable().optional(),
    quantity: z.number(),
    rawMaterialProductId: z.string().nullable().optional(),
    rawMaterialQuantity: z.number().nullable().optional(),
    size: z.string().nullable().optional(),
    material: z.string().nullable().optional(),
    submittedPrice: z.number().nullable().optional(),
    sourceItemId: z.string().nullable().optional(),
    serviceNote: z.string().max(5000).nullable().optional(),
  })).min(1).optional(),
  quoteFingerprint: z.string().min(1).optional(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  invoiceTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional().nullable(),
  invoiceDateReason: z.string().optional().nullable(),
}).superRefine((value, context) => {
  if (Boolean(value.items) !== Boolean(value.quoteFingerprint)) {
    context.addIssue({
      code: "custom",
      message: "Item dan fingerprint harga harus dikirim bersama",
    });
  }
});

class ApprovalQuoteChangedError extends Error {
  constructor(readonly quote: ApprovalQuote) {
    super("APPROVAL_QUOTE_CHANGED");
  }
}

const MAX_ATTEMPTS = 5;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("transaction.draft", "update");
    const storeId = user.storeId || "store-main";
    const { id } = await params;

    const body = await request.json();
    const parsed = approveDraftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const {
      paymentMethod,
      amountPaid,
      invoiceDate,
      invoiceTime,
      invoiceDateReason,
    } = parsed.data;

    const draft = await db.transaction.findFirst({
      where: { id, storeId },
      include: {
        items: true,
        salesperson: { select: { name: true } },
      },
    });

    if (!draft) {
      return NextResponse.json(
        { message: "Faktur sementara tidak ditemukan" },
        { status: 404 },
      );
    }

    if (draft.status !== "DRAFT") {
      return NextResponse.json(
        { message: "Faktur ini bukan draft" },
        { status: 409 },
      );
    }

    // SALES cannot approve a SALES-created draft (preserves existing fraud control)
    if (user.role === "SALES" && draft.requestedById) {
      throw new AuthError(403, "Insufficient permissions");
    }

    const isTempo = paymentMethod === "TEMPO";
    if (isTempo && !draft.customerId) {
      return NextResponse.json(
        { message: "Pilih pelanggan sebelum menggunakan pembayaran Tempo." },
        { status: 422 },
      );
    }

    if (!isTempo && amountPaid <= 0) {
      return NextResponse.json(
        { message: "Pembayaran harus lebih dari 0" },
        { status: 422 },
      );
    }

    const approvalItems: ApprovalItemInput[] = parsed.data.items ?? draft.items.map((item) => ({
      sourceItemId: item.id,
      serviceNote: item.serviceNote ?? null,
      productId: item.productId ?? null,
      printingServiceId: item.printingServiceId ?? null,
      quantity: Number(item.quantity),
      rawMaterialProductId: item.rawMaterialProductId ?? null,
      rawMaterialQuantity:
        item.rawMaterialQuantity == null ? null : Number(item.rawMaterialQuantity),
      size: item.size ?? null,
      material: item.material ?? null,
      submittedPrice: Number(item.unitPrice),
    }));
    const permissions =
      process.env.NODE_ENV !== "production" && process.env.E2E_AUTH_BYPASS === "1"
        ? buildDefaultRolePermissions()
        : await getGlobalRolePermissions();
    const canViewCostPrice = canRolePerformAction(
      user.role,
      "product.price_log",
      "read",
      permissions,
    );
    const approvalQuote = await buildApprovalQuote(db as never, {
      storeId,
      transactionId: id,
      actorRole: user.role,
      canViewCostPrice,
      items: approvalItems,
    });
    if (
      parsed.data.quoteFingerprint &&
      approvalQuote.fingerprint !== parsed.data.quoteFingerprint
    ) {
      throw new ApprovalQuoteChangedError(approvalQuote);
    }

    const total = approvalQuote.total;
    if (isTempo && amountPaid > total) {
      return NextResponse.json(
        { message: "Pembayaran awal Tempo tidak boleh melebihi total transaksi." },
        { status: 422 },
      );
    }
    // Record gross tender; reports subtract the separately recorded change.
    const finalAmountPaid = amountPaid;
    const submittedPaymentTotal = parsed.data.payments?.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );
    if (
      parsed.data.payments &&
      Math.abs(submittedPaymentTotal! - finalAmountPaid) > 0.01
    ) {
      return NextResponse.json(
        { message: "Rincian pembayaran awal tidak sesuai dengan jumlah diterima." },
        { status: 422 },
      );
    }
    if (isTempo && finalAmountPaid > 0 && !parsed.data.payments?.length) {
      return NextResponse.json(
        { message: "Pilih metode pembayaran untuk jumlah yang benar-benar diterima." },
        { status: 422 },
      );
    }
    const paymentRows =
      parsed.data.payments ??
      (!isTempo && finalAmountPaid > 0
        ? [{ method: paymentMethod as "CASH" | "DEBIT" | "CREDIT" | "QRIS" | "TRANSFER", amount: finalAmountPaid }]
        : []);
    const isDP = !isTempo && amountPaid < total;
    const change = !isTempo && amountPaid > total ? amountPaid - total : 0;
    const newStatus = isTempo ? "COMPLETED" : isDP ? "DP" : "COMPLETED";

    const now = await getInvoiceNow();
    const hasCustomInvoiceDate = Boolean(invoiceDate || invoiceTime);
    if (hasCustomInvoiceDate && user.role !== "OWNER" && user.role !== "ADMIN") {
      return NextResponse.json(
        { message: "Hanya Owner atau Admin yang boleh mengatur tanggal invoice." },
        { status: 403 },
      );
    }

    const resolvedInvoiceDate = hasCustomInvoiceDate
      ? resolveInvoiceDateTime({
          mode: "edit",
          date: invoiceDate ?? jakartaDateKey(draft.invoiceDate ?? now),
          time: invoiceTime,
          now,
          previousInvoiceDate: draft.invoiceDate ?? now,
        })
      : draft.invoiceDate ?? now;
    const dateStr = compactJakartaDateKey(resolvedInvoiceDate);

    if (
      hasCustomInvoiceDate &&
      requiresInvoiceDateReason({ invoiceDate: resolvedInvoiceDate, now }) &&
      !invoiceDateReason?.trim()
    ) {
      return NextResponse.json(
        { message: "Alasan wajib diisi untuk tanggal invoice beda hari." },
        { status: 422 },
      );
    }

    let updated: {
      invoiceNumber: string;
      items: typeof draft.items;
    } | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        updated = await db.$transaction(
          async (tx) => {
            const customerArgs = buildCustomerUpdateArgs({
              customerId: draft.customerId || null, isDP: isDP || isTempo,
              total, amountPaid: finalAmountPaid,
            });
            if (customerArgs) await tx.customer.update(customerArgs);
            const quoteForApproval = await buildApprovalQuote(tx, {
              storeId,
              transactionId: id,
              actorRole: user.role,
              canViewCostPrice,
              items: approvalItems,
            });
            if (quoteForApproval.fingerprint !== approvalQuote.fingerprint) {
              throw new ApprovalQuoteChangedError(quoteForApproval);
            }

            // Compute next invoice number from real-sales counter
            const todayCount = await tx.transaction.count({
              where: {
                storeId,
                invoiceNumber: { startsWith: `INV-${dateStr}-` },
              },
            });
            const invoiceNumber = `INV-${dateStr}-${String(
              todayCount + 1 + attempt,
            ).padStart(4, "0")}`;

            const updateResult = await tx.transaction.updateMany({
              where: { id, storeId, status: "DRAFT", total: draft.total, tax: draft.tax, taxRate: draft.taxRate, taxMethod: draft.taxMethod },
              data: {
                status: newStatus,
                invoiceNumber,
                invoiceDate: resolvedInvoiceDate,
                cashierId: user.id,
                paymentMethod,
                amountPaid: finalAmountPaid,
                change,
                stockDeductionSource: "TRANSACTION",
                productionStatus: draft.isJobOrder ? "PRINTING" : null,
                subtotal: quoteForApproval.subtotal,
                discount: quoteForApproval.discount,
                tax: quoteForApproval.tax,
                taxMethod: getTransactionTaxMethod(draft),
                total: quoteForApproval.total,
              },
            });

            if (updateResult.count !== 1) {
              throw new Error("DRAFT_NOT_FOUND");
            }

            const approved = await tx.transaction.update({
              where: { id },
              data: {
                items: {
                  deleteMany: {},
                  create: quoteForApproval.items.map((line) => ({
                    productId: line.input.productId ?? null,
                    printingServiceId: line.input.printingServiceId ?? null,
                    rawMaterialProductId: line.input.rawMaterialProductId ?? null,
                    rawMaterialQuantity: line.input.rawMaterialQuantity ?? null,
                    rawMaterialUnit: line.rawMaterialUnit,
                    serviceNote: line.input.serviceNote ?? null,
                    productName: line.name,
                    quantity: line.input.quantity,
                    unitPrice: line.appliedUnitPrice,
                    originalUnitPrice: line.regular,
                    appliedUnitPrice: line.appliedUnitPrice,
                    discount: 0,
                    subtotal: line.subtotal,
                    material: line.input.material ?? null,
                    size: line.input.size ?? null,
                    unitCost: line.unitCost,
                    pricingRuleId: line.appliedPricing?.ruleId ?? null,
                    pricingCustomerType: line.appliedPricing?.customerType ?? null,
                    pricingCategoryId: line.appliedPricing?.categoryId ?? null,
                    pricingCategoryName: line.appliedPricing?.categoryName ?? null,
                    pricingMode: line.appliedPricing?.mode ?? null,
                    pricingValue: line.appliedPricing?.value ?? null,
                    pricingDiscountPercent: line.appliedPricing?.discountPercent ?? null,
                    pricingUnit: line.appliedPricing?.unit ?? null,
                    pricingBrandId: line.appliedPricing?.brandId ?? null,
                    pricingBrandName: line.appliedPricing?.brandName ?? null,
                  })),
                },
              },
              include: { items: true } as const,
            }) as typeof draft;

            await tx.transactionPayment.deleteMany({ where: { transactionId: id } });
            if (paymentRows.length > 0) {
              await tx.transactionPayment.createMany({
                data: paymentRows.map((payment) => ({
                  transactionId: id,
                  method: payment.method,
                  amount: payment.amount,
                })),
              });
            }

            const stockMovements = await applyProductStockDeltas(tx, {
              storeId,
              items: quoteForApproval.items.flatMap((line) => [
                ...(line.input.productId
                  ? [{ productId: line.input.productId, delta: -line.input.quantity }]
                  : []),
                ...(line.input.rawMaterialProductId && line.input.rawMaterialQuantity
                  ? [{
                      productId: line.input.rawMaterialProductId,
                      delta: -line.input.rawMaterialQuantity,
                    }]
                  : []),
              ]),
            });

            const inventoryRows: InventoryLogRow[] = [
              ...quoteForApproval.items.flatMap((line) =>
                line.input.productId
                  ? [{
                      productId: line.input.productId,
                      type: "OUT" as const,
                      reason: "SALE" as const,
                      quantity: line.input.quantity,
                      unitCost: line.unitCost,
                      note: `Approve Draft ${invoiceNumber}`,
                      createdBy: user.id,
                      person: user.name ?? null,
                    }]
                  : [],
              ),
              ...buildServiceMaterialInventoryLogRows({
                items: quoteForApproval.items.flatMap((line) =>
                  line.input.printingServiceId
                    ? [{
                        lineType: "PRINTING_SERVICE" as const,
                        rawMaterialProductId: line.input.rawMaterialProductId ?? null,
                        rawMaterialQuantity: line.input.rawMaterialQuantity ?? null,
                        name: line.name,
                        material: line.input.material ?? null,
                        rawMaterialCostPrice: line.rawMaterialUnitCost,
                      }]
                    : [],
                ),
                invoiceNumber,
                userId: user.id,
                userName: user.name ?? null,
              }),
            ];
            if (inventoryRows.length > 0) {
              await tx.inventoryLog.createMany({
                data: buildTransactionStockJournal({
                  transactionId: id,
                  inventoryRows,
                  stockMovements,
                }),
              });
            }

            return { invoiceNumber, items: approved.items };
          },
          { maxWait: 5000, timeout: 30_000 },
        );
        break;
      } catch (err) {
        if (
          (err as { code?: string })?.code === "P2002" &&
          attempt < MAX_ATTEMPTS - 1
        ) {
          log.warn(
            `invoiceNumber collision on attempt ${attempt + 1}, retrying`,
          );
          continue;
        }
        throw err;
      }
    }

    if (!updated) {
      throw new Error("APPROVE_FAILED");
    }

    return NextResponse.json(
      {
        ...draft,
        items: updated.items,
        status: newStatus,
        invoiceNumber: updated.invoiceNumber,
        invoiceDate: resolvedInvoiceDate,
        cashierId: user.id,
        paymentMethod,
        amountPaid: finalAmountPaid,
        change,
        total,
        subtotal: approvalQuote.subtotal,
        discount: approvalQuote.discount,
        tax: approvalQuote.tax,
        payments: paymentRows,
      },
      { status: 200 },
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof ApprovalQuoteChangedError) {
      const { items, ...quoteWithoutCost } = error.quote;
      return NextResponse.json(
        {
          code: "APPROVAL_QUOTE_CHANGED",
          message: "Harga atau isi nota berubah. Periksa kembali sebelum menyetujui.",
          quote: {
            ...quoteWithoutCost,
            items: items.map(({
              unitCost: _unitCost,
              rawMaterialUnitCost: _rawMaterialUnitCost,
              ...item
            }) => item),
          },
        },
        { status: 409 },
      );
    }

    if (
      error instanceof StockMutationError &&
      error.message === "INSUFFICIENT_STOCK"
    ) {
      return NextResponse.json(
        { message: "Stok produk tidak mencukupi" },
        { status: 409 },
      );
    }
    if (
      error instanceof StockMutationError &&
      error.message === "CONVERSION_NEEDS_REVIEW"
    ) {
      return NextResponse.json(
        { message: "Konversi unit produk perlu direview sebelum stok bisa diproses" },
        { status: 422 },
      );
    }
    if (error instanceof Error && error.message === "DRAFT_NOT_FOUND") {
      return NextResponse.json(
        { message: "Faktur sementara tidak ditemukan atau sudah berubah" },
        { status: 409 },
      );
    }

    if (error instanceof Error && error.message.startsWith("APPROVAL_")) {
      const status =
        error.message === "APPROVAL_TRANSACTION_NOT_FOUND" ||
        error.message === "APPROVAL_PRODUCT_NOT_FOUND" ||
        error.message === "APPROVAL_PRINTING_SERVICE_NOT_FOUND"
          ? 404
          : error.message === "APPROVAL_TRANSACTION_NOT_EDITABLE"
            ? 409
            : 422;
      const messages: Record<string, string> = {
        APPROVAL_TRANSACTION_NOT_FOUND: "Nota sementara tidak ditemukan.",
        APPROVAL_TRANSACTION_NOT_EDITABLE: "Nota ini tidak dapat disetujui lagi.",
        APPROVAL_PRODUCT_NOT_FOUND: "Produk tidak ditemukan atau sudah tidak aktif.",
        APPROVAL_PRINTING_SERVICE_NOT_FOUND: "Jasa cetak tidak ditemukan atau sudah tidak aktif.",
        APPROVAL_CART_EMPTY: "Tambahkan minimal satu barang sebelum menyetujui.",
        APPROVAL_ITEM_SOURCE_REQUIRED: "Pilih produk atau jasa untuk setiap baris.",
        APPROVAL_INVALID_QUANTITY: "Jumlah barang harus bilangan bulat positif.",
        APPROVAL_INVALID_PRICE: "Harga barang tidak valid.",
        APPROVAL_INVALID_RAW_MATERIAL_QUANTITY: "Jumlah bahan baku tidak valid.",
        APPROVAL_RAW_MATERIAL_QUANTITY_REQUIRED: "Jumlah bahan baku wajib diisi.",
      };
      return NextResponse.json(
        { message: messages[error.message] ?? "Rincian nota tidak valid." },
        { status },
      );
    }

    log.error("Failed to approve draft:", error);
    return NextResponse.json(
      { message: "Failed to approve draft" },
      { status: 500 },
    );
  }
}
