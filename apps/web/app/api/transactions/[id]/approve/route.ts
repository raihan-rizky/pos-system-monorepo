import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";

const approveTransactionSchema = z.object({
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]),
  amountPaid: z.number().min(0),
});

export const dynamic = "force-dynamic";

// POST /api/transactions/[id]/approve
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER");
    
    const body = await request.json();
    const parsed = approveTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { paymentMethod, amountPaid } = parsed.data;
    const { id } = params;

    // Fetch the pending transaction
    const transaction = await db.transaction.findUnique({
      where: { id },
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
      const updated = await tx.transaction.update({
        where: { id },
        data: {
          status: newStatus,
          cashierId: user.id,
          paymentMethod,
          amountPaid: finalAmountPaid,
          change,
        },
      });

      // 2. Update customer metrics if needed
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

      return updated;
    });

    return NextResponse.json(updatedTransaction, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Failed to approve transaction:", error);
    return NextResponse.json(
      { message: "Failed to approve transaction" },
      { status: 500 }
    );
  }
}
