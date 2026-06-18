import { after, NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

import { getLogger } from "@/lib/logger";
import { buildCustomerUpdateArgs } from "@/features/pos-checkout/post-commit";
import {
  applyProductStockDeltas,
  StockMutationError,
} from "@/features/product-stock-groups/stock-mutations";

const log = getLogger("api:transactions:id:approve");
const approveTransactionSchema = z.object({
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]).optional(),
  amountPaid: z.number().min(0).optional(),
  isPayLater: z.boolean().optional(),
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

    // Fetch the pending transaction
    const transaction = await db.transaction.findFirst({
      where: { id, storeId },
      include: { items: true, salesperson: { select: { name: true } } }
    });

    if (!transaction) {
      return NextResponse.json({ message: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    const isSalesRequestedInvoice =
      Boolean(transaction.requestedById) && !transaction.cashierId;
    if (transaction.status !== "PENDING_APPROVAL" && !isSalesRequestedInvoice) {
      return NextResponse.json({ message: "Transaksi bukan PENDING_APPROVAL" }, { status: 409 });
    }

    const total = Number(transaction.total);
    const paymentMethod = (parsed.data.paymentMethod || transaction.paymentMethod) as
      | "CASH"
      | "DEBIT"
      | "CREDIT"
      | "QRIS"
      | "TRANSFER";
    const amountPaid = parsed.data.amountPaid !== undefined 
      ? parsed.data.amountPaid 
      : Number(transaction.amountPaid);
    const isPayLater = parsed.data.isPayLater === true;
    const isDP = isPayLater || (amountPaid > 0 && amountPaid < total);
    
    if (amountPaid === 0 && !isPayLater) {
      return NextResponse.json({ message: "Pembayaran harus lebih dari 0" }, { status: 422 });
    }

    const change = amountPaid > total ? amountPaid - total : 0;
    const finalAmountPaid = amountPaid;
    const newStatus =
      transaction.status === "PENDING_APPROVAL"
        ? isDP ? "DP" : "COMPLETED"
        : transaction.status;

    // Keep the interactive transaction focused on the state transition and
    // stock mutation. Audit/customer side effects run after the response,
    // matching the normal checkout path.
    const updatedTransaction = await db.$transaction(async (tx) => {
      // 1. Update the transaction
      const updateResult = await tx.transaction.updateMany({
        where: {
          id,
          storeId,
          ...(transaction.status === "PENDING_APPROVAL"
            ? { status: "PENDING_APPROVAL" as const }
            : { requestedById: { not: null }, cashierId: null }),
        },
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

      // 2. Deduct stock in one round-trip since it wasn't done during the
      // SALES request phase.
      await applyProductStockDeltas(tx, {
        storeId,
        items: transaction.items
          .filter((item): item is typeof item & { productId: string } =>
            Boolean(item.productId),
          )
          .map((item) => ({
            productId: item.productId,
            delta: -item.quantity,
          })),
      });

      return {
        ...transaction,
        status: newStatus,
        cashierId: user.id,
        paymentMethod,
        amountPaid: finalAmountPaid,
        change,
      };
    },
    {
      maxWait: 5000,
      timeout: 15000,
    });

    const inventoryRows = transaction.items
      .filter((item): item is typeof item & { productId: string } =>
        Boolean(item.productId),
      )
      .map((item) => ({
        productId: item.productId,
        type: "OUT" as const,
        reason: "SALE" as const,
        quantity: item.quantity,
        unitCost:
          item.unitCost === null || item.unitCost === undefined
            ? null
            : Number(item.unitCost.toString()),
        note: `Approve Penjualan ${transaction.invoiceNumber}`,
        createdBy: user.id,
        person: user.name ?? null,
      }));
    const customerArgs = buildCustomerUpdateArgs({
      customerId: transaction.customerId || null,
      isDP,
      total,
      amountPaid: finalAmountPaid,
    });

    after(async () => {
      try {
        await Promise.all([
          inventoryRows.length > 0
            ? db.inventoryLog.createMany({ data: inventoryRows })
            : Promise.resolve(),
          customerArgs ? db.customer.update(customerArgs) : Promise.resolve(),
        ]);
      } catch (sideEffectError) {
        log.error(
          `Post-approval side effects failed for ${transaction.invoiceNumber}:`,
          sideEffectError,
        );
      }
    });

    return NextResponse.json(updatedTransaction, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (
      error instanceof StockMutationError &&
      error.message === "INSUFFICIENT_STOCK"
    ) {
      return NextResponse.json(
        { message: "Stok produk tidak mencukupi" },
        { status: 409 }
      );
    }
    if (
      error instanceof StockMutationError &&
      error.message === "CONVERSION_NEEDS_REVIEW"
    ) {
      return NextResponse.json(
        { message: "Konversi unit produk perlu direview sebelum stok bisa diproses" },
        { status: 422 },
      );
    }

    if (error instanceof Error && error.message === "TRANSACTION_NOT_PENDING") {
      return NextResponse.json(
        { message: "Transaksi bukan PENDING_APPROVAL" },
        { status: 409 }
      );
    }

    log.error("Failed to approve transaction:", error);
    return NextResponse.json(
      { message: "Failed to approve transaction" },
      { status: 500 }
    );
  }
}


