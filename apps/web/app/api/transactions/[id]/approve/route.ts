import { getInvoiceNow } from "@/features/invoice-date/services/internet-clock";
import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { buildDefaultRolePermissions, canRolePerformAction } from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import {
  buildApprovalQuote,
  type ApprovalItemInput,
  type ApprovalQuote,
} from "@/features/transactions-draft/services/approval-quote";

import { getLogger } from "@/lib/logger";
import {
  buildInvoiceDocumentNumber,
  chooseDocumentSequence,
  jakartaDateKey,
  parseDocumentSequence,
  requiresInvoiceDateReason,
  resolveInvoiceDateTime,
} from "@/features/invoice-date/helpers/invoice-date-core";
import { buildCustomerUpdateArgs } from "@/features/pos-checkout/post-commit";
import { buildServiceMaterialInventoryLogRows, type InventoryLogRow } from "@/features/pos-checkout/post-commit";
import { buildTransactionStockJournal } from "@/features/transactions-stock/helpers/transaction-stock-journal";
import {
  applyProductStockDeltas,
  StockMutationError,
} from "@/features/product-stock-groups/stock-mutations";

const log = getLogger("api:transactions:id:approve");
const approveTransactionSchema = z.object({
  payments: z.array(z.object({ method: z.enum(["CASH", "QRIS", "TRANSFER", "DEBIT", "CREDIT"]), amount: z.number().positive() })).optional(),
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER", "TEMPO"]).optional(),
  amountPaid: z.number().min(0).optional(),
  isPayLater: z.boolean().optional(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  invoiceTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional().nullable(),
  invoiceDateReason: z.string().optional().nullable(),
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
}).superRefine((value, context) => {
  if (Boolean(value.items) !== Boolean(value.quoteFingerprint)) {
    context.addIssue({
      code: "custom",
      message: "Item dan fingerprint penawaran harus dikirim bersama",
    });
  }
});

class ApprovalQuoteChangedError extends Error {
  constructor(readonly quote: ApprovalQuote) {
    super("APPROVAL_QUOTE_CHANGED");
  }
}

export const dynamic = "force-dynamic";

// POST /api/transactions/[id]/approve
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("transaction.approve", "update");
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    
    const body = await request.json();
    const parsed = approveTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 }
      );
    }

    // Fetch the pending transaction
    const transaction = await db.transaction.findFirst({
      where: { id, storeId },
      include: { items: true, payments: true, salesperson: { select: { name: true } } }
    });

    if (!transaction) {
      return NextResponse.json({ message: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    const isSalesRequestedInvoice =
      Boolean(transaction.requestedById) && !transaction.cashierId;
    if (
      transaction.status === "VOIDED" ||
      (transaction.status === "COMPLETED" && !isSalesRequestedInvoice)
    ) {
      return NextResponse.json({ message: "Transaksi sudah selesai" }, { status: 409 });
    }
    if (transaction.status !== "PENDING_APPROVAL" && !isSalesRequestedInvoice) {
      return NextResponse.json({ message: "Transaksi bukan PENDING_APPROVAL" }, { status: 409 });
    }

    const hasApprovalItems = Boolean(parsed.data.items && parsed.data.quoteFingerprint);
    let approvalQuote: ApprovalQuote | null = null;
    if (hasApprovalItems) {
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
      approvalQuote = await buildApprovalQuote(db as never, {
        storeId,
        transactionId: id,
        actorRole: user.role,
        canViewCostPrice,
        items: parsed.data.items as ApprovalItemInput[],
      });
      if (approvalQuote.fingerprint !== parsed.data.quoteFingerprint) {
        throw new ApprovalQuoteChangedError(approvalQuote);
      }
    }

    const total = approvalQuote?.total ?? Number(transaction.total);
    const paymentMethod = (parsed.data.paymentMethod || transaction.paymentMethod) as
      | "CASH"
      | "DEBIT"
      | "CREDIT"
      | "QRIS"
      | "TRANSFER"
      | "TEMPO";
    const amountPaid = parsed.data.amountPaid !== undefined 
      ? parsed.data.amountPaid 
      : Number(transaction.amountPaid);
    const isPayLater = parsed.data.isPayLater === true;
    const isTempo = paymentMethod === "TEMPO";
    if (isTempo && !transaction.customerId) {
      return NextResponse.json(
        { message: "Pilih pelanggan sebelum menggunakan pembayaran Tempo." },
        { status: 422 },
      );
    }
    const isDP = !isTempo && (isPayLater || (amountPaid > 0 && amountPaid < total));
    const hasCustomInvoiceDate = Boolean(parsed.data.invoiceDate || parsed.data.invoiceTime);

    if (hasCustomInvoiceDate && user.role !== "OWNER" && user.role !== "ADMIN") {
      return NextResponse.json(
        { message: "Hanya Owner atau Admin yang boleh mengatur tanggal invoice." },
        { status: 403 },
      );
    }

    const now = await getInvoiceNow();
    const resolvedInvoiceDate = hasCustomInvoiceDate
      ? resolveInvoiceDateTime({
          mode: "edit",
          date: parsed.data.invoiceDate ?? jakartaDateKey(transaction.invoiceDate ?? now),
          time: parsed.data.invoiceTime,
          now,
          previousInvoiceDate: transaction.invoiceDate ?? now,
        })
      : transaction.invoiceDate ?? now;

    if (
      hasCustomInvoiceDate &&
      requiresInvoiceDateReason({ invoiceDate: resolvedInvoiceDate, now }) &&
      !parsed.data.invoiceDateReason?.trim()
    ) {
      return NextResponse.json(
        { message: "Alasan wajib diisi untuk tanggal invoice beda hari." },
        { status: 422 },
      );
    }

    let finalInvoiceNumber = transaction.invoiceNumber;
    if (hasCustomInvoiceDate) {
      const prefix = buildInvoiceDocumentNumber(resolvedInvoiceDate, 0).slice(0, -4);
      const existingNumbers = await db.transaction.findMany({
        where: {
          storeId,
          invoiceNumber: { startsWith: prefix },
          id: { not: id },
        },
        select: { invoiceNumber: true },
      });
      const existingSequences = existingNumbers
        .map((row) => parseDocumentSequence(row.invoiceNumber))
        .filter((sequence): sequence is number => sequence !== null);
      const currentSequence = parseDocumentSequence(transaction.invoiceNumber) ?? 1;
      finalInvoiceNumber = buildInvoiceDocumentNumber(
        resolvedInvoiceDate,
        chooseDocumentSequence({
          currentSequence,
          existingSequencesForDate: existingSequences,
        }),
      );
    }
    
    if (amountPaid === 0 && !isPayLater && !isTempo) {
      return NextResponse.json({ message: "Pembayaran harus lebih dari 0" }, { status: 422 });
    }

    const change = amountPaid > total ? amountPaid - total : 0;
    const finalAmountPaid = amountPaid;
    const newStatus =
      transaction.status === "PENDING_APPROVAL"
        ? isDP ? "DP" : "COMPLETED"
        : transaction.status;

    const savedPayments = (transaction.payments ?? []).filter((payment) => payment.method !== "TEMPO" && Number(payment.amount) > 0);
    const savedAmount = savedPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const preserveSavedPayments =
      (parsed.data.paymentMethod === undefined || parsed.data.paymentMethod === transaction.paymentMethod) &&
      Math.abs(savedAmount - finalAmountPaid) < 0.01;
    const actualMethod = paymentMethod === "TEMPO"
      ? transaction.paymentMethod !== "TEMPO" ? transaction.paymentMethod : savedPayments[0]?.method ?? "CASH"
      : paymentMethod;
    const paymentRows = parsed.data.payments ?? (preserveSavedPayments
      ? savedPayments.map((payment) => ({ method: payment.method, amount: Number(payment.amount) }))
      : finalAmountPaid > 0 ? [{ method: actualMethod, amount: finalAmountPaid }] : []);
    if (Math.abs(paymentRows.reduce((sum, payment) => sum + payment.amount, 0) - finalAmountPaid) >= 0.01) {
      return NextResponse.json({ message: "Jumlah metode pembayaran harus sesuai dengan uang yang diterima." }, { status: 422 });
    }

    // Stock mutations and their reversal evidence must commit together.
    const updatedTransaction = await db.$transaction(async (tx) => {
      const customerArgs = buildCustomerUpdateArgs({
        customerId: transaction.customerId || null, isDP: isDP || isTempo,
        total, amountPaid: finalAmountPaid,
      });
      if (customerArgs) await tx.customer.update(customerArgs);
      let quoteForApproval = approvalQuote;
      if (hasApprovalItems) {
        quoteForApproval = await buildApprovalQuote(tx, {
          storeId,
          transactionId: id,
          actorRole: user.role,
          canViewCostPrice: approvalQuote?.items.some((item) => item.modal !== null) ?? false,
          items: parsed.data.items as ApprovalItemInput[],
        });
        if (quoteForApproval.fingerprint !== parsed.data.quoteFingerprint) {
          throw new ApprovalQuoteChangedError(quoteForApproval);
        }
      }

      // 1. Update the transaction
      const updateResult = await tx.transaction.updateMany({
        where: {
          id,
          storeId,
          total: transaction.total,
          tax: transaction.tax,
          taxRate: transaction.taxRate,
          taxMethod: transaction.taxMethod,
          ...(transaction.status === "PENDING_APPROVAL"
            ? { status: "PENDING_APPROVAL" as const }
            : { requestedById: { not: null }, cashierId: null }),
        },
        data: {
          status: newStatus,
          cashierId: user.id,
          paymentMethod,
          amountPaid: finalAmountPaid,
          change,
          stockDeductionSource: "TRANSACTION",
          ...(quoteForApproval
            ? {
                subtotal: quoteForApproval.subtotal,
                discount: quoteForApproval.discount,
                tax: quoteForApproval.tax,
                total: quoteForApproval.total,
              }
            : {}),
          ...(hasCustomInvoiceDate
            ? {
                invoiceDate: resolvedInvoiceDate,
                invoiceNumber: finalInvoiceNumber,
              }
            : {}),
        },
      });

      if (updateResult.count !== 1) {
        throw new Error("TRANSACTION_NOT_PENDING");
      }

      await tx.transactionPayment.deleteMany({ where: { transactionId: id } });
      if (paymentRows.length > 0) {
        await tx.transactionPayment.createMany({ data: paymentRows.map((payment) => ({ transactionId: id, ...payment })) });
      }

      let approvedItems = transaction.items;
      let approvedTransaction: typeof transaction | null = null;
      if (quoteForApproval) {
        const persisted = await tx.transaction.update({
          where: { id },
          data: {
            items: {
              deleteMany: {},
              create: quoteForApproval.items.map((line) => ({
                productId: line.input.productId ?? null,
                productName: line.name,
                quantity: line.input.quantity,
                unitPrice: line.appliedUnitPrice,
                discount: 0,
                subtotal: line.subtotal,
                material: line.input.material ?? null,
                size: line.input.size ?? null,
                unitCost: line.unitCost,
                printingServiceId: line.input.printingServiceId ?? null,
                rawMaterialProductId: line.input.rawMaterialProductId ?? null,
                rawMaterialQuantity: line.input.rawMaterialQuantity ?? null,
                rawMaterialUnit: line.rawMaterialUnit,
                serviceNote: line.input.serviceNote ?? null,
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
                originalUnitPrice: line.regular,
                appliedUnitPrice: line.appliedUnitPrice,
              })),
            },
          },
          include: { items: true } as const,
        }) as typeof transaction;
        approvedItems = persisted.items as typeof transaction.items;
        approvedTransaction = persisted as typeof transaction;
      }

      // 2. Deduct stock in one round-trip since it wasn't done during the
      // SALES request phase.
      const stockDeltas = quoteForApproval
        ? quoteForApproval.items.flatMap((line) => [
            ...(line.input.productId
              ? [{ productId: line.input.productId, delta: -line.input.quantity }]
              : []),
            ...(line.input.rawMaterialProductId && line.input.rawMaterialQuantity
              ? [{
                  productId: line.input.rawMaterialProductId,
                  delta: -line.input.rawMaterialQuantity,
                }]
              : []),
          ])
        : transaction.items.flatMap((item) => [
            ...(item.productId
              ? [{ productId: item.productId, delta: -item.quantity }]
              : []),
            ...(item.rawMaterialProductId && item.rawMaterialQuantity
              ? [{
                  productId: item.rawMaterialProductId,
                  delta: -Number(item.rawMaterialQuantity),
                }]
              : []),
          ]);
      const stockMovements = await applyProductStockDeltas(tx, {
        storeId,
        items: stockDeltas,
      });

      {
        const inventoryRows: InventoryLogRow[] = quoteForApproval ? [
          ...quoteForApproval.items.flatMap((line) =>
            line.input.productId
              ? [{
                  productId: line.input.productId!,
                  type: "OUT" as const,
                  reason: "SALE" as const,
                  quantity: line.input.quantity,
                  unitCost: line.unitCost,
                  note: `Approve Penjualan ${finalInvoiceNumber}`,
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
            invoiceNumber: finalInvoiceNumber ?? id,
            userId: user.id,
            userName: user.name ?? null,
          }),
        ] : [
          ...approvedItems.flatMap((item) => item.productId ? [{
            productId: item.productId,
            type: "OUT" as const,
            reason: "SALE" as const,
            quantity: item.quantity,
            unitCost: item.unitCost == null ? null : Number(item.unitCost),
            note: `Approve Penjualan ${finalInvoiceNumber}`,
            createdBy: user.id,
            person: user.name ?? null,
          }] : []),
          ...buildServiceMaterialInventoryLogRows({
            items: approvedItems.flatMap((item) => item.rawMaterialProductId ? [{
              lineType: "PRINTING_SERVICE" as const,
              rawMaterialProductId: item.rawMaterialProductId,
              rawMaterialQuantity: item.rawMaterialQuantity == null ? null : Number(item.rawMaterialQuantity),
              name: item.productName,
              material: item.material ?? null,
              rawMaterialCostPrice: null,
            }] : []),
            invoiceNumber: finalInvoiceNumber ?? id,
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
      }

      return {
        ...(approvedTransaction ?? transaction),
        items: approvedItems,
        status: newStatus,
        cashierId: user.id,
        invoiceNumber: finalInvoiceNumber,
        invoiceDate: resolvedInvoiceDate,
        paymentMethod,
        amountPaid: finalAmountPaid,
        change,
        payments: paymentRows,
      };
    },
    {
      maxWait: 5000,
      timeout: 15000,
    });

    return NextResponse.json(updatedTransaction, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof ApprovalQuoteChangedError) {
      const { items, ...quoteWithoutCost } = error.quote;
      return NextResponse.json(
        {
          code: "APPROVAL_QUOTE_CHANGED",
          message: "Harga atau isi transaksi berubah. Periksa kembali sebelum menyetujui.",
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
        { status: 409 }
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

    if (error instanceof Error && error.message === "TRANSACTION_NOT_PENDING") {
      return NextResponse.json(
        { message: "Transaksi bukan PENDING_APPROVAL" },
        { status: 409 }
      );
    }

    log.error("Failed to approve transaction:", error);
    return NextResponse.json(
      { message: "Failed to approve transaction" },
      { status: 500 }
    );
  }
}


