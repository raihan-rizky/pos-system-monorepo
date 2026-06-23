import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

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

      const updatedCustomer = await tx.customer.findFirst({
        where: { id, storeId },
        select: { id: true, name: true, totalDebt: true, totalSpent: true },
      });

      // Find the oldest DP transaction for this customer and update amountPaid
      // This provides traceability of debt payments
      const dpTransaction = await tx.transaction.findFirst({
        where: {
          customerId: id,
          storeId,
          status: "DP",
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, total: true, amountPaid: true, note: true },
      });

      if (dpTransaction) {
        // Allocate only up to this invoice's remaining balance so a payment
        // larger than the oldest invoice can't push its amountPaid past total.
        const totalAmount = Number(dpTransaction.total);
        const remaining = totalAmount - Number(dpTransaction.amountPaid);
        const allocated = Math.min(amount, Math.max(0, remaining));
        const newAmountPaid = Number(dpTransaction.amountPaid) + allocated;

        await tx.transaction.update({
          where: { id: dpTransaction.id },
          data: {
            amountPaid: newAmountPaid,
            // If fully paid, mark as COMPLETED
            status: newAmountPaid >= totalAmount ? "COMPLETED" : "DP",
            // Append the manual note if provided, else keep existing note
            note: note
              ? (dpTransaction.note ? `${dpTransaction.note} | ${note}` : note)
              : dpTransaction.note,
          },
        });
        await tx.debtPaymentLog.create({
          data: {
            transactionId: dpTransaction.id,
            customerId: id,
            storeId,
            amount,
            paymentMethod,
            note: note || null,
          },
        });
      }

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

    log.error("[POST /api/customers/[id]/pay-debt]", error);
    return NextResponse.json(
      { message: "Gagal mencatat pembayaran piutang" },
      { status: 500 }
    );
  }
}
