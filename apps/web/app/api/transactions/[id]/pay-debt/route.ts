import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:transactions:id:pay-debt");
export const dynamic = "force-dynamic";

const payDebtSchema = z.object({
  amount: z.number().positive("Jumlah harus lebih dari 0"),
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]).default("CASH"),
  note: z.string().max(300).optional(),
});

// POST /api/transactions/[id]/pay-debt
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("transaction", "update");
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const body = await request.json();
    const parsed = payDebtSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { amount, note, paymentMethod } = parsed.data;

    // Fetch transaction
    const transaction = await db.transaction.findFirst({
      where: { id, storeId },
      select: { id: true, status: true, total: true, amountPaid: true, customerId: true },
    });

    if (!transaction) {
      return NextResponse.json(
        { message: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    if (transaction.status !== "DP") {
      return NextResponse.json(
        { message: "Hanya transaksi dengan status DP yang dapat dibayar piutangnya" },
        { status: 422 }
      );
    }

    const currentPaid = Number(transaction.amountPaid);
    const total = Number(transaction.total);
    const maxAmount = total - currentPaid;

    if (amount > maxAmount) {
      return NextResponse.json(
        {
          message: `Jumlah pembayaran (${amount}) melebihi sisa piutang (${maxAmount})`,
          maxAmount,
        },
        { status: 422 }
      );
    }

    // Process payment in a transaction
    const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const newAmountPaid = currentPaid + amount;
      const newStatus = newAmountPaid >= total ? "COMPLETED" : "DP";
      
      const updatedTx = await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          amountPaid: newAmountPaid,
          status: newStatus,
          note: note
            ? `${note} | Pelunasan ${new Intl.NumberFormat("id-ID").format(amount)} (${paymentMethod})`
            : `Pelunasan piutang ${new Intl.NumberFormat("id-ID").format(amount)} (${paymentMethod})`,
        },
      });

      // Update customer totalDebt and totalSpent if customerId exists
      if (transaction.customerId) {
        await tx.customer.update({
          where: { id: transaction.customerId },
          data: {
            totalDebt: { decrement: amount },
            totalSpent: { increment: amount },
            lastVisitAt: new Date(),
          },
        });
        await tx.debtPaymentLog.create({
          data: {
            transactionId: transaction.id,
            customerId: transaction.customerId,
            storeId,
            amount,
            paymentMethod,
            note: note || null,
          },
        });
      }

      return updatedTx;
    });

    return NextResponse.json({
      success: true,
      transaction: {
        id: updated.id,
        amountPaid: updated.amountPaid,
        status: updated.status,
      },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("[POST /api/transactions/[id]/pay-debt]", error);
    return NextResponse.json(
      { message: "Gagal mencatat pembayaran piutang transaksi" },
      { status: 500 }
    );
  }
}
