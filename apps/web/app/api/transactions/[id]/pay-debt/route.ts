import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:transactions:id:pay-debt");
export const dynamic = "force-dynamic";

// Thrown inside the payment transaction when a concurrent request already
// settled this transaction (re-read no longer DP, or a guarded write matched
// no row). Surfaced as a 409 so the client can refresh and retry.
class DebtConflictError extends Error {
  constructor() {
    super("DEBT_CONFLICT");
    this.name = "DebtConflictError";
  }
}

const payDebtSchema = z.object({
  amount: z.number().positive("Jumlah harus lebih dari 0"),
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]).default("CASH"),
  customerId: z.string().optional(),
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

    const { amount, customerId, note, paymentMethod, payments: rawPayments } = parsed.data;

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

    const debtCustomerId = transaction.customerId ?? customerId ?? null;

    if (!debtCustomerId) {
      return NextResponse.json(
        { message: "Customer wajib dipilih untuk mencatat pembayaran piutang" },
        { status: 422 }
      );
    }

    const debtCustomer = await db.customer.findFirst({
      where: { id: debtCustomerId, storeId },
      select: { id: true },
    });

    if (!debtCustomer) {
      return NextResponse.json(
        { message: "Customer tidak ditemukan untuk pembayaran piutang" },
        { status: 404 }
      );
    }

    // Process payment in a transaction.
    //
    // The status/maxAmount checks above run before the transaction opens and
    // are therefore advisory only: two concurrent payments can both pass them
    // and then both apply, double-charging the customer and driving
    // customer.totalDebt negative. Inside the transaction we re-read the
    // authoritative row, re-validate, and use optimistically-guarded writes
    // (`updateMany` constrained to the still-DP row and to a sufficient
    // totalDebt). A zero match means a concurrent request beat us, so we abort
    // with 409 and record nothing.
    const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const fresh = await tx.transaction.findFirst({
        where: { id, storeId },
        select: { id: true, status: true, total: true, amountPaid: true, customerId: true, note: true },
      });

      if (!fresh || fresh.status !== "DP") {
        throw new DebtConflictError();
      }

      const freshPaid = Number(fresh.amountPaid);
      const freshTotal = Number(fresh.total);
      if (totalPaymentAmount > freshTotal - freshPaid) {
        throw new DebtConflictError();
      }

      const newAmountPaid = freshPaid + totalPaymentAmount;
      const newStatus = newAmountPaid >= freshTotal ? "COMPLETED" : "DP";

      const guardedTx = await tx.transaction.updateMany({
        where: { id, storeId, status: "DP" },
        data: {
          amountPaid: newAmountPaid,
          status: newStatus,
          ...(fresh.customerId ? {} : { customerId: debtCustomerId }),
          // Append the manual note if provided, else keep existing note
          note: note
            ? (fresh.note ? `${fresh.note} | ${note}` : note)
            : fresh.note,
        },
      });

      if (guardedTx.count !== 1) {
        throw new DebtConflictError();
      }

      // Update the customer debt ledger. For older/unlinked transactions shown
      // by customer-name matching, attach the selected customer now so the
      // paid-off invoice remains visible in piutang history.
      if (debtCustomerId) {
        const guardedCustomer = await tx.customer.updateMany({
          where: { id: debtCustomerId, storeId, totalDebt: { gte: totalPaymentAmount } },
          data: {
            totalDebt: { decrement: totalPaymentAmount },
            totalSpent: { increment: totalPaymentAmount },
            lastVisitAt: new Date(),
          },
        });

        if (guardedCustomer.count !== 1) {
          throw new DebtConflictError();
        }

        if (resolvedPayments.length > 0) {
          await tx.debtPaymentLog.createMany({
            data: resolvedPayments.map((p) => ({
              transactionId: id,
              customerId: debtCustomerId,
              storeId,
              amount: p.amount,
              paymentMethod: p.method,
              note: note || null,
            })),
          });
        }
      }

      return {
        id,
        amountPaid: newAmountPaid,
        status: newStatus,
      };
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

    if (error instanceof DebtConflictError) {
      return NextResponse.json(
        { message: "Pembayaran piutang sudah diproses oleh permintaan lain" },
        { status: 409 }
      );
    }

    log.error("[POST /api/transactions/[id]/pay-debt]", error);
    return NextResponse.json(
      { message: "Gagal mencatat pembayaran piutang transaksi" },
      { status: 500 }
    );
  }
}
