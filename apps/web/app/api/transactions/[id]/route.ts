import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { z } from "zod";

import { getLogger } from "@/lib/logger";
import {
  reverseTransaction,
  TransactionReversalConflictError,
} from "@/features/transactions-stock/services/transaction-reversal-service";

const log = getLogger("api:transactions:id");
const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
};

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  COMPLETED: ["DP", "VOIDED", "REFUNDED"],
  DP: ["COMPLETED", "VOIDED"],
  PENDING_APPROVAL: ["COMPLETED", "VOIDED"],
  VOIDED: [],
  REFUNDED: [],
};

const updateTransactionSchema = z.object({
  salesName: z.string().optional().nullable(),
  salespersonId: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]).optional(),
  status: z.enum(["COMPLETED", "DP", "VOIDED", "REFUNDED", "PENDING_APPROVAL"]).optional(),
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

    const { salesName, salespersonId, customerName, paymentMethod, status } = parsed.data;

    const existingTransaction = await db.transaction.findFirst({
      where: { id, storeId },
      select: {
        id: true,
        status: true,
        printingSubcategory: true,
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

    // Validate status transition
    if (status !== undefined && status !== existingTransaction.status) {
      const userRole = user.role;
      if (userRole !== "OWNER" && userRole !== "ADMIN") {
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

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { message: "Tidak ada field yang diubah" },
        { status: 422 }
      );
    }

    if (status === "VOIDED" && status !== existingTransaction.status) {
      const transactionUpdates = { ...updateData };
      delete transactionUpdates.status;
      const outcome = await db.$transaction(async (tx) => {
        const result = await reverseTransaction(tx, {
          storeId,
          transactionId: id,
          action: "VOID",
          actor: { id: user.id, name: user.name ?? null, role: user.role },
        });
        if (result === "APPLIED" && Object.keys(transactionUpdates).length > 0) {
          await tx.transaction.update({ where: { id }, data: transactionUpdates });
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

    const updated = await db.transaction.update({
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

    return NextResponse.json(updated);
  } catch (error: any) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof TransactionReversalConflictError) {
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
    const source = await db.transaction.findFirst({ where: { id, storeId }, select: { printingSubcategory: true } });
    if (source?.printingSubcategory) {
      return NextResponse.json({ message: "Nota Percetakan disimpan di Riwayat. Gunakan pembatalan atau refund untuk membatalkan transaksi." }, { status: 409 });
    }
    const outcome = await db.$transaction(
      (tx) => reverseTransaction(tx, {
        storeId,
        transactionId: id,
        action: "DELETE",
        actor: { id: user.id, name: user.name ?? null, role: user.role },
      }),
      { timeout: 30_000 },
    );
    if (outcome === "NOT_FOUND") {
      return NextResponse.json({ message: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
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
