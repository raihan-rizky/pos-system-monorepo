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
  payments: z.array(z.object({
    method: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]),
    amount: z.number().min(0),
  })).optional(),
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

    const { amount, note, paymentMethod, payments: rawPayments } = parsed.data;

    // Resolve payments array
    const resolvedPayments = rawPayments && rawPayments.length > 0
      ? rawPayments
      : [{ method: paymentMethod, amount }];

    const totalPaymentAmount = resolvedPayments.reduce((sum, p) => sum + p.amount, 0);

    // Determine primary payment method for note
    const primaryPaymentMethod = resolvedPayments.reduce((primary, p) =>
      p.amount > primary.amount ? p : primary,
      resolvedPayments[0],
    ).method;

    // Fetch transaction
    const transaction = await db.transaction.findFirst({
      where: { id, storeId },
      select: { id: true, status: true, total: true, amountPaid: true, customerId: true, note: true },
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

    if (totalPaymentAmount > maxAmount) {
      return NextResponse.json(
        {
          message: `Jumlah pembayaran (${totalPaymentAmount}) melebihi sisa piutang (${maxAmount})`,
          maxAmount,
        },
        { status: 422 }
      );
    }

    // Process payment in a transaction
    const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const newAmountPaid = currentPaid + totalPaymentAmount;
      const newStatus = newAmountPaid >= total ? "COMPLETED" : "DP";
      
      const paymentSummaryStr = resolvedPayments
        .map((p) => `${new Intl.NumberFormat("id-ID").format(p.amount)} (${p.method})`)
        .join(", ");

      const updatedTx = await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          amountPaid: newAmountPaid,
          status: newStatus,
          // Append the manual note if provided, else keep existing note
          note: note
            ? (transaction.note ? `${transaction.note} | ${note}` : note)
            : transaction.note,
        },
      });

      // Update customer totalDebt and totalSpent if customerId exists
      if (transaction.customerId) {
        await tx.customer.update({
          where: { id: transaction.customerId },
          data: {
            totalDebt: { decrement: totalPaymentAmount },
            totalSpent: { increment: totalPaymentAmount },
            lastVisitAt: new Date(),
          },
        });
        
        if (resolvedPayments.length > 0) {
          await tx.debtPaymentLog.createMany({
            data: resolvedPayments.map((p) => ({
              transactionId: transaction.id,
              customerId: transaction.customerId!,
              storeId,
              amount: p.amount,
              paymentMethod: p.method,
              note: note || null,
            })),
          });
        }
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
