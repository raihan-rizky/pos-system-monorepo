import { after, NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

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
import {
  applyProductStockDeltas,
  StockMutationError,
} from "@/features/product-stock-groups/stock-mutations";

const log = getLogger("api:transactions:id:approve");
const approveTransactionSchema = z.object({
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]).optional(),
  amountPaid: z.number().min(0).optional(),
  isPayLater: z.boolean().optional(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  invoiceTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional().nullable(),
  invoiceDateReason: z.string().optional().nullable(),
});

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
      include: { items: true, salesperson: { select: { name: true } } }
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

    const total = Number(transaction.total);
    const paymentMethod = (parsed.data.paymentMethod || transaction.paymentMethod) as
      | "CASH"
      | "DEBIT"
      | "CREDIT"
      | "QRIS"
      | "TRANSFER";
    const amountPaid = parsed.data.amountPaid !== undefined 
      ? parsed.data.amountPaid 
      : Number(transaction.amountPaid);
    const isPayLater = parsed.data.isPayLater === true;
    const isDP = isPayLater || (amountPaid > 0 && amountPaid < total);
    const hasCustomInvoiceDate = Boolean(parsed.data.invoiceDate || parsed.data.invoiceTime);

    if (hasCustomInvoiceDate && user.role !== "OWNER" && user.role !== "ADMIN") {
      return NextResponse.json(
        { message: "Hanya Owner atau Admin yang boleh mengatur tanggal invoice." },
        { status: 403 },
      );
    }

    const now = new Date();
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
    
    if (amountPaid === 0 && !isPayLater) {
      return NextResponse.json({ message: "Pembayaran harus lebih dari 0" }, { status: 422 });
    }

    const change = amountPaid > total ? amountPaid - total : 0;
    const finalAmountPaid = amountPaid;
    const newStatus =
      transaction.status === "PENDING_APPROVAL"
        ? isDP ? "DP" : "COMPLETED"
        : transaction.status;

    // Keep the interactive transaction focused on the state transition and
    // stock mutation. Audit/customer side effects run after the response,
    // matching the normal checkout path.
    const updatedTransaction = await db.$transaction(async (tx) => {
      // 1. Update the transaction
      const updateResult = await tx.transaction.updateMany({
        where: {
          id,
          storeId,
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

      // 2. Deduct stock in one round-trip since it wasn't done during the
      // SALES request phase.
      await applyProductStockDeltas(tx, {
        storeId,
        items: transaction.items
          .filter((item): item is typeof item & { productId: string } =>
            Boolean(item.productId),
          )
          .map((item) => ({
            productId: item.productId,
            delta: -item.quantity,
          })),
      });

      return {
        ...transaction,
        status: newStatus,
        cashierId: user.id,
        invoiceNumber: finalInvoiceNumber,
        invoiceDate: resolvedInvoiceDate,
        paymentMethod,
        amountPaid: finalAmountPaid,
        change,
      };
    },
    {
      maxWait: 5000,
      timeout: 15000,
    });

    const inventoryRows = transaction.items
      .filter((item): item is typeof item & { productId: string } =>
        Boolean(item.productId),
      )
      .map((item) => ({
        productId: item.productId,
        type: "OUT" as const,
        reason: "SALE" as const,
        quantity: item.quantity,
        unitCost:
          item.unitCost === null || item.unitCost === undefined
            ? null
            : Number(item.unitCost.toString()),
        note: `Approve Penjualan ${finalInvoiceNumber}`,
        createdBy: user.id,
        person: user.name ?? null,
      }));
    const customerArgs = buildCustomerUpdateArgs({
      customerId: transaction.customerId || null,
      isDP,
      total,
      amountPaid: finalAmountPaid,
    });

    after(async () => {
      try {
        await Promise.all([
          inventoryRows.length > 0
            ? db.inventoryLog.createMany({ data: inventoryRows })
            : Promise.resolve(),
          customerArgs ? db.customer.update(customerArgs) : Promise.resolve(),
        ]);
      } catch (sideEffectError) {
        log.error(
          `Post-approval side effects failed for ${transaction.invoiceNumber}:`,
          sideEffectError,
        );
      }
    });

    return NextResponse.json(updatedTransaction, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

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


