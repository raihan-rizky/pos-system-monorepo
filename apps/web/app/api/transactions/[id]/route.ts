import { NextResponse } from "next/server";
import { db, type Prisma } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { z } from "zod";
import { containsTransactionNoteAnnotations, mergeTransactionUserNote } from "@/app/(main)/history/helpers/transaction-note";

import { getLogger } from "@/lib/logger";
import {
  reverseTransaction,
  TransactionReversalConflictError,
} from "@/features/transactions-stock/services/transaction-reversal-service";
import { captureReceiptSnapshot, recordReceiptChange, shouldRecordReceiptChange } from "@/features/receipt-changes/server/receipt-change-audit";

const log = getLogger("api:transactions:id");
const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
};

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["VOIDED"],
  COMPLETED: ["DP", "VOIDED", "REFUNDED"],
  DP: ["COMPLETED", "VOIDED"],
  PENDING_APPROVAL: ["COMPLETED", "VOIDED"],
  VOIDED: [],
  REFUNDED: [],
};

const NOTE_EDITABLE_STATUSES = new Set(["PENDING_APPROVAL", "DRAFT", "COMPLETED", "DP"]);

function canEditTransactionNote(transaction: {
  status: string;
  printingSubcategory: string | null;
  printingReceipt: { id: string } | null;
  suratJalan: { id: string }[];
}) {
  return NOTE_EDITABLE_STATUSES.has(transaction.status) && !transaction.printingSubcategory &&
    !transaction.printingReceipt && transaction.suratJalan.length === 0;
}

const updateTransactionSchema = z.object({
  salesName: z.string().optional().nullable(),
  salespersonId: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]).optional(),
  status: z.enum(["COMPLETED", "DP", "VOIDED", "REFUNDED", "PENDING_APPROVAL"]).optional(),
  note: z.string().optional(),
  expectedNote: z.string().nullable().optional(),
}).refine((value) => value.note === undefined || value.expectedNote !== undefined, {
  path: ["expectedNote"],
  message: "Catatan awal diperlukan untuk menyimpan perubahan.",
});

// GET /api/transactions/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("transaction", "read");
    const storeId = user.storeId || "store-main";
    const { id } = await params;

    const transaction = await db.transaction.findFirst({
      where: { id, storeId },
      include: {
        printingReceipt: { select: { id: true, subcategory: true, number: true } },
        cashier: { select: { name: true } },
        salesperson: { select: { name: true } },
        payments: {
          select: { amount: true, method: true },
        },
        debtPaymentLogs: {
          select: { id: true, createdAt: true, amount: true, paymentMethod: true },
          orderBy: { createdAt: "desc" },
        },
        invoiceDateChangeLogs: {
          select: {
            id: true,
            oldInvoiceDate: true,
            newInvoiceDate: true,
            oldDocumentNumber: true,
            newDocumentNumber: true,
            reason: true,
            actorName: true,
            actorRole: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        items: {
          include: {
            product: {
              select: {
                unit: true,
                imageUrl: true,
                category: { select: { name: true } },
              },
            },
            printingService: { select: { unit: true } },
          },
        },
      },
    });

    if (!transaction) {
      return NextResponse.json(
        { message: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    const createdAt = toIsoString(transaction.createdAt) ?? new Date(0).toISOString();
    const invoiceDate = toIsoString(transaction.invoiceDate) ?? createdAt;

    return NextResponse.json({
      ...transaction,
      invoiceDate,
      createdAt,
      invoiceDateChangeLogs: (transaction.invoiceDateChangeLogs ?? []).map((entry) => ({
        ...entry,
        oldInvoiceDate: toIsoString(entry.oldInvoiceDate) ?? createdAt,
        newInvoiceDate: toIsoString(entry.newInvoiceDate) ?? invoiceDate,
        createdAt: toIsoString(entry.createdAt) ?? createdAt,
      })),
      payments: (transaction.payments ?? []).map((payment) => ({
        amount: Number(payment.amount),
        method: payment.method,
      })),
      debtPaymentLogs: (transaction.debtPaymentLogs ?? []).map((payment) => ({
        id: payment.id,
        createdAt: toIsoString(payment.createdAt) ?? createdAt,
        amount: Number(payment.amount),
        paymentMethod: payment.paymentMethod,
      })),
      items: transaction.items.map((item) => ({
        ...item,
        createdAt:
          toIsoString((item as { createdAt?: Date | string | null }).createdAt) ?? createdAt,
      })),
    });
  } catch (error: any) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch transaction:", error);
    return NextResponse.json(
      { message: "Failed to fetch transaction" },
      { status: 500 }
    );
  }
}

class TransactionNoteConflictError extends Error {
  constructor() {
    super("Catatan transaksi sudah berubah. Tutup dan buka kembali transaksi sebelum mencoba lagi.");
  }
}

// PATCH /api/transactions/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let id = "";
  try {
    const user = await requirePermission("transaction", "update");
    const storeId = user.storeId || "store-main";
    ({ id } = await params);
    const body = await request.json();
    const parsed = updateTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { salesName, salespersonId, customerName, paymentMethod, status, note, expectedNote } = parsed.data;

    if (note !== undefined && containsTransactionNoteAnnotations(note)) {
      return NextResponse.json({ message: "Hapus penanda [DIVISI:...] atau teks pelunasan otomatis dari catatan, lalu coba lagi." }, { status: 422 });
    }

    const existingTransaction = await db.transaction.findFirst({
      where: { id, storeId },
      select: {
        id: true,
        status: true,
        printingSubcategory: true,
        printingReceipt: { select: { id: true } },
        suratJalan: { select: { id: true }, take: 1 },
        payments: {
          select: { id: true },
          take: 2,
        },
      },
    });

    if (!existingTransaction) {
      return NextResponse.json(
        { message: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    if (existingTransaction.printingSubcategory && customerName !== undefined) {
      return NextResponse.json({ message: "Pelanggan pada nota Percetakan yang sudah diproses mengikuti dokumen asli." }, { status: 409 });
    }

    if (note !== undefined && !canEditTransactionNote(existingTransaction)) {
      return NextResponse.json({ message: "Catatan transaksi ini tidak dapat diubah melalui formulir Riwayat." }, { status: 409 });
    }

    // Validate status transition
    if (status !== undefined && status !== existingTransaction.status) {
      const userRole = user.role;
      if (status !== "VOIDED" && userRole !== "OWNER" && userRole !== "ADMIN") {
        return NextResponse.json(
          { message: "Hanya Owner atau Admin yang dapat mengubah status transaksi" },
          { status: 403 }
        );
      }

      const allowed = ALLOWED_STATUS_TRANSITIONS[existingTransaction.status] ?? [];
      if (!allowed.includes(status)) {
        return NextResponse.json(
          { message: `Tidak dapat mengubah status dari ${existingTransaction.status} ke ${status}` },
          { status: 409 }
        );
      }
    }

    if (salespersonId) {
      const salesperson = await db.salesperson.findFirst({
        where: { id: salespersonId, storeId },
        select: { id: true },
      });

      if (!salesperson) {
        return NextResponse.json(
          { message: "Salesperson not found" },
          { status: 404 }
        );
      }
    }

    // Build update payload â€” only include defined fields
    const updateData: Record<string, any> = {};
    if (salesName !== undefined) updateData.salesName = salesName || null;
    if (salespersonId !== undefined) updateData.salespersonId = salespersonId || null;
    if (customerName !== undefined) updateData.customerName = customerName || null;
    if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
    if (paymentMethod !== undefined && existingTransaction.payments.length === 1) {
      updateData.payments = {
        updateMany: {
          where: {},
          data: { method: paymentMethod },
        },
      };
    }
    if (status !== undefined && status !== existingTransaction.status) updateData.status = status;

    if (Object.keys(updateData).length === 0 && note === undefined) {
      return NextResponse.json(
        { message: "Tidak ada field yang diubah" },
        { status: 422 }
      );
    }

    if (status === "VOIDED" && status !== existingTransaction.status) {
      const transactionUpdates = { ...updateData };
      delete transactionUpdates.status;
      const outcome = await db.$transaction(async (tx) => {
        let statusBeforeReversal: string = existingTransaction.status;
        let receiptBefore: Awaited<ReturnType<typeof captureReceiptSnapshot>> | null = null;
        const result = await reverseTransaction(tx, {
          storeId,
          transactionId: id,
          action: "VOID",
          actor: { id: user.id, name: user.name ?? null, role: user.role },
          ...(note !== undefined ? {
            beforeApply: async (lockedStatus: string) => {
              statusBeforeReversal = lockedStatus;
              if (shouldRecordReceiptChange(user, lockedStatus)) {
                receiptBefore = await captureReceiptSnapshot(tx, storeId, id);
              }
            },
          } : {}),
        });
        if (result === "ALREADY_VOIDED" && note !== undefined) {
          throw new TransactionNoteConflictError();
        }
        if (result === "APPLIED" && note !== undefined) {
          const current = await tx.transaction.findFirstOrThrow({
            where: { id, storeId },
            select: { note: true, printingSubcategory: true, printingReceipt: { select: { id: true } }, suratJalan: { select: { id: true }, take: 1 } },
          });
          if (current.note !== expectedNote || !canEditTransactionNote({ ...current, status: statusBeforeReversal })) {
            throw new TransactionNoteConflictError();
          }
          transactionUpdates.note = mergeTransactionUserNote(current.note, note);
        }
        if (result === "APPLIED" && Object.keys(transactionUpdates).length > 0) {
          await tx.transaction.update({ where: { id }, data: transactionUpdates });
        }
        if (result === "APPLIED" && receiptBefore) {
          await recordReceiptChange(tx, { storeId, transactionId: id, actor: user, before: receiptBefore });
        }
        return result;
      }, { timeout: 30_000 });
      if (outcome === "NOT_FOUND") {
        return NextResponse.json({ message: "Transaksi tidak ditemukan" }, { status: 404 });
      }

      const updated = await db.transaction.findUniqueOrThrow({
        where: { id },
        include: {
          items: {
            select: {
              id: true,
              productName: true,
              size: true,
              material: true,
              quantity: true,
              unitPrice: true,
              discount: true,
              pricingRuleId: true,
              pricingCustomerType: true,
              pricingCategoryId: true,
              pricingCategoryName: true,
              pricingMode: true,
              pricingValue: true,
              pricingDiscountPercent: true,
              originalUnitPrice: true,
              appliedUnitPrice: true,
              subtotal: true,
              productId: true,
              unitCost: true,
            },
          },
          cashier: { select: { name: true } },
        },
      });
      return NextResponse.json(updated);
    }

    const persistUpdate = (client: Prisma.TransactionClient) => client.transaction.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          select: {
            id: true,
            productName: true,
            size: true,
            material: true,
            quantity: true,
            unitPrice: true,
            discount: true,
            pricingRuleId: true,
            pricingCustomerType: true,
            pricingCategoryId: true,
            pricingCategoryName: true,
            pricingMode: true,
            pricingValue: true,
            pricingDiscountPercent: true,
            originalUnitPrice: true,
            appliedUnitPrice: true,
            subtotal: true,
            productId: true,
            unitCost: true,
          },
        },
        cashier: { select: { name: true } },
      },
    });

    const updated = user.role === "SALES" || note !== undefined
      ? await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "pos_transactions" WHERE "id" = ${id} AND "storeId" = ${storeId} FOR UPDATE`;
          const current = await tx.transaction.findFirstOrThrow({
            where: { id, storeId },
            select: { status: true, note: true, printingSubcategory: true, printingReceipt: { select: { id: true } }, suratJalan: { select: { id: true }, take: 1 } },
          });
          if (note !== undefined) {
            if (current.note !== expectedNote || !canEditTransactionNote(current)) throw new TransactionNoteConflictError();
            updateData.note = mergeTransactionUserNote(current.note, note);
          }
          const receiptBefore = shouldRecordReceiptChange(user, current.status)
            ? await captureReceiptSnapshot(tx, storeId, id)
            : null;
          const result = await persistUpdate(tx);
          if (receiptBefore) {
            await recordReceiptChange(tx, { storeId, transactionId: id, actor: user, before: receiptBefore });
          }
          return result;
        })
      : await persistUpdate(db);

    return NextResponse.json(updated);
  } catch (error: any) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof TransactionReversalConflictError || error instanceof TransactionNoteConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }

    log.error("Failed to update transaction:", error);
    if (error?.code === "P2025") {
      return NextResponse.json(
        { message: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { message: "Failed to update transaction" },
      { status: 500 }
    );
  }
}

// DELETE /api/transactions/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let id = "";
  try {
    const user = await requirePermission("transaction", "delete");
    const storeId = user.storeId || "store-main";
    ({ id } = await params);
    const warnings: Array<{ code: string; message: string }> = [];
    const outcome = await db.$transaction(
      (tx) => reverseTransaction(tx, {
        storeId,
        transactionId: id,
        action: "DELETE",
        actor: { id: user.id, name: user.name ?? null, role: user.role },
        onWarning: (warning) => warnings.push(warning),
      }),
      { timeout: 30_000 },
    );
    if (outcome === "NOT_FOUND") {
      return NextResponse.json({ message: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    return warnings.length > 0
      ? NextResponse.json({ warnings })
      : new NextResponse(null, { status: 204 });
  } catch (error: any) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof TransactionReversalConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }

    log.error("Failed to delete transaction:", error);
    if (error?.code === "P2025") {
      return NextResponse.json(
        { message: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { message: "Failed to delete transaction" },
      { status: 500 }
    );
  }
}
