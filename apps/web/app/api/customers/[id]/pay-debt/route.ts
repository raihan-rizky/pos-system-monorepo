import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { allocateCustomerDebtPayment } from "@/features/customer-debt/helpers/customer-debt-allocation";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:customers:id:pay-debt");
export const dynamic = "force-dynamic";

// Thrown inside the payment transaction when the balance-guarded decrement
// matches no row — i.e. a concurrent payment already cleared the debt.
class DebtConflictError extends Error {
  constructor() {
    super("DEBT_CONFLICT");
    this.name = "DebtConflictError";
  }
}

class DebtAllocationError extends Error {
  constructor() {
    super("Jumlah pembayaran melebihi total piutang aktif.");
    this.name = "DebtAllocationError";
  }
}

const payDebtSchema = z.object({
  amount: z.number().positive("Jumlah harus lebih dari 0"),
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]).default("CASH"),
  note: z.string().max(300).optional(),
});

// POST /api/customers/[id]/pay-debt
// Records a debt payment (pelunasan piutang) for a customer.
// Decrements the customer's totalDebt and increments totalSpent.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("customer", "update");
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

    // Fetch current customer to validate debt
    const customer = await db.customer.findFirst({
      where: { id, storeId },
      select: { id: true, name: true, totalDebt: true },
    });

    if (!customer) {
      return NextResponse.json(
        { message: "Customer not found" },
        { status: 404 }
      );
    }

    const currentDebt = Number(customer.totalDebt);

    if (currentDebt <= 0) {
      return NextResponse.json(
        { message: "Pelanggan tidak memiliki piutang" },
        { status: 422 }
      );
    }

    if (amount > currentDebt) {
      return NextResponse.json(
        {
          message: `Jumlah pembayaran (${amount}) melebihi sisa piutang (${currentDebt})`,
          maxAmount: currentDebt,
        },
        { status: 422 }
      );
    }

    // Atomically decrement debt and increment totalSpent.
    //
    // The balance check above is advisory only — it runs before the
    // transaction opens, so two concurrent "Bayar Piutang" requests can both
    // pass it and then both decrement, driving totalDebt negative and
    // double-crediting the customer. The authoritative guard is the
    // `updateMany` with `totalDebt: { gte: amount }` below: it matches the row
    // only when the debt is still sufficient at write time. A zero match means
    // a concurrent payment beat us to it, so we abort with 409 and record
    // nothing.
    const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const guarded = await tx.customer.updateMany({
        where: { id, storeId, totalDebt: { gte: amount } },
        data: {
          totalDebt: { decrement: amount },
          totalSpent: { increment: amount },
          lastVisitAt: new Date(),
        },
      });

      if (guarded.count !== 1) {
        throw new DebtConflictError();
      }

      const activeTransactions = await tx.transaction.findMany({
        where: {
          customerId: id,
          storeId,
          OR: [
            { status: "DP" },
            { status: "COMPLETED", paymentMethod: "TEMPO" },
          ],
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          total: true,
          amountPaid: true,
          status: true,
          paymentMethod: true,
          note: true,
        },
      });

      const candidates = activeTransactions.map((transaction) => ({
        ...transaction,
        total: Number(transaction.total),
        amountPaid: Number(transaction.amountPaid),
      }));
      let allocations;
      try {
        allocations = allocateCustomerDebtPayment({ amount, transactions: candidates });
      } catch {
        throw new DebtAllocationError();
      }

      const transactionById = new Map(
        activeTransactions.map((transaction) => [transaction.id, transaction]),
      );
      for (const allocation of allocations) {
        const transaction = transactionById.get(allocation.transactionId);
        if (!transaction) throw new DebtConflictError();

        const guardedTransaction = await tx.transaction.updateMany({
          where: {
            id: transaction.id,
            storeId,
            status: transaction.status,
            amountPaid: transaction.amountPaid,
            ...(transaction.status === "COMPLETED" && transaction.paymentMethod === "TEMPO"
              ? { paymentMethod: "TEMPO" }
              : {}),
          },
          data: {
            amountPaid: allocation.amountPaid,
            status: allocation.status,
            note: note
              ? (transaction.note ? `${transaction.note} | ${note}` : note)
              : transaction.note,
          },
        });

        if (guardedTransaction.count !== 1) throw new DebtConflictError();

        await tx.debtPaymentLog.create({
          data: {
            transactionId: transaction.id,
            customerId: id,
            storeId,
            amount: allocation.amount,
            paymentMethod,
            note: note || null,
          },
        });
      }

      const updatedCustomer = await tx.customer.findFirst({
        where: { id, storeId },
        select: { id: true, name: true, totalDebt: true, totalSpent: true },
      });

      return updatedCustomer;
    });

    if (!updated) {
      throw new Error("Customer not found after update");
    }

    return NextResponse.json({
      success: true,
      customer: {
        id: updated.id,
        name: updated.name,
        totalDebt: updated.totalDebt,
        totalSpent: updated.totalSpent,
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

    if (error instanceof DebtAllocationError) {
      return NextResponse.json(
        { message: error.message },
        { status: 422 },
      );
    }

    log.error("[POST /api/customers/[id]/pay-debt]", error);
    return NextResponse.json(
      { message: "Gagal mencatat pembayaran piutang" },
      { status: 500 }
    );
  }
}
