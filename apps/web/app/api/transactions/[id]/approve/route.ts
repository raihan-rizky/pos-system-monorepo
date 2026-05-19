import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

const approveTransactionSchema = z.object({
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]),
  amountPaid: z.number().min(0),
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

    const { paymentMethod, amountPaid } = parsed.data;

    // Fetch the pending transaction
    const transaction = await db.transaction.findFirst({
      where: { id, storeId },
      include: { items: true }
    });

    if (!transaction) {
      return NextResponse.json({ message: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    if (transaction.status !== "PENDING_APPROVAL") {
      return NextResponse.json({ message: "Transaksi bukan PENDING_APPROVAL" }, { status: 400 });
    }

    const total = Number(transaction.total);
    const isDP = amountPaid > 0 && amountPaid < total;
    if (amountPaid === 0) {
      return NextResponse.json({ message: "Pembayaran harus lebih dari 0" }, { status: 400 });
    }

    const change = amountPaid > total ? amountPaid - total : 0;
    const finalAmountPaid = amountPaid > total ? total : amountPaid;
    const newStatus = isDP ? "DP" : "COMPLETED";

    // Use a transaction block to update both transaction and customer stats
    const updatedTransaction = await db.$transaction(async (tx) => {
      // 1. Update the transaction
      const updateResult = await tx.transaction.updateMany({
        where: { id, storeId, status: "PENDING_APPROVAL" },
        data: {
          status: newStatus,
          cashierId: user.id,
          paymentMethod,
          amountPaid: finalAmountPaid,
          change,
        },
      });

      if (updateResult.count !== 1) {
        throw new Error("TRANSACTION_NOT_PENDING");
      }

      // 2. Deduct stock for each item since it wasn't done during the request phase
      for (const item of transaction.items) {
        const stockUpdate = await tx.product.updateMany({
          where: {
            id: item.productId,
            storeId,
            stock: { gte: item.quantity },
          },
          data: { stock: { decrement: item.quantity } },
        });

        if (stockUpdate.count !== 1) {
          throw new Error("INSUFFICIENT_STOCK");
        }

        // Log inventory change
        await tx.inventoryLog.create({
          data: {
            productId: item.productId,
            type: "OUT",
            quantity: item.quantity,
            note: `Approve Penjualan ${transaction.invoiceNumber}`,
            createdBy: user.id,
            person: user.name,
          },
        });
      }

      // 3. Update customer metrics if needed
      if (transaction.customerId) {
        const debtIncrement = isDP ? total - finalAmountPaid : 0;
        await tx.customer.update({
          where: { id: transaction.customerId },
          data: {
            totalSpent: { increment: finalAmountPaid },
            totalOrders: { increment: 1 },
            totalDebt: debtIncrement > 0 ? { increment: debtIncrement } : undefined,
            lastVisitAt: new Date(),
          },
        });
      }

      return tx.transaction.findUniqueOrThrow({
        where: { id },
        include: { items: true, salesperson: { select: { name: true } } },
      });
    });

    return NextResponse.json(updatedTransaction, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      return NextResponse.json(
        { message: "Stok produk tidak mencukupi" },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message === "TRANSACTION_NOT_PENDING") {
      return NextResponse.json(
        { message: "Transaksi bukan PENDING_APPROVAL" },
        { status: 409 }
      );
    }

    console.error("Failed to approve transaction:", error);
    return NextResponse.json(
      { message: "Failed to approve transaction" },
      { status: 500 }
    );
  }
}


