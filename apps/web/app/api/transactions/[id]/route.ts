import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { z } from "zod";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:transactions:id");
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
      select: { id: true, status: true },
    });

    if (!existingTransaction) {
      return NextResponse.json(
        { message: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
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
    if (status !== undefined && status !== existingTransaction.status) updateData.status = status;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { message: "Tidak ada field yang diubah" },
        { status: 422 }
      );
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
            subtotal: true,
          },
        },
        cashier: { select: { name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

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

    const existingTransaction = await db.transaction.findFirst({
      where: { id, storeId },
      select: { id: true },
    });

    if (!existingTransaction) {
      return NextResponse.json(
        { message: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    // Delete items first (referential integrity), then the transaction
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.transactionItem.deleteMany({ where: { transactionId: id } });
      await tx.transaction.delete({ where: { id } });
    });

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

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
