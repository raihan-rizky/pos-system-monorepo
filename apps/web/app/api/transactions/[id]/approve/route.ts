import { after, NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

import { getLogger } from "@/lib/logger";
import { buildStockDecrementParams } from "@/features/pos-checkout/stock-decrement";
import { buildCustomerUpdateArgs } from "@/features/pos-checkout/post-commit";

const log = getLogger("api:transactions:id:approve");
const approveTransactionSchema = z.object({
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]).optional(),
  amountPaid: z.number().min(0).optional(),
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

    if (transaction.status !== "PENDING_APPROVAL") {
      return NextResponse.json({ message: "Transaksi bukan PENDING_APPROVAL" }, { status: 409 });
    }

    const total = Number(transaction.total);
    const paymentMethod = transaction.paymentMethod as
      | "CASH"
      | "DEBIT"
      | "CREDIT"
      | "QRIS"
      | "TRANSFER";
    const amountPaid = Number(transaction.amountPaid);
    const isDP = amountPaid > 0 && amountPaid < total;
    if (amountPaid === 0) {
      return NextResponse.json({ message: "Pembayaran harus lebih dari 0" }, { status: 422 });
    }

    const change = amountPaid > total ? amountPaid - total : 0;
    const finalAmountPaid = amountPaid;
    const newStatus = isDP ? "DP" : "COMPLETED";

    // Keep the interactive transaction focused on the state transition and
    // stock mutation. Audit/customer side effects run after the response,
    // matching the normal checkout path.
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

      // 2. Deduct stock in one round-trip since it wasn't done during the
      // SALES request phase.
      const { values, expectedRowCount } = buildStockDecrementParams(
        transaction.items
          .filter((item): item is typeof item & { productId: string } =>
            Boolean(item.productId),
          )
          .map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        storeId,
      );

      if (expectedRowCount > 0) {
        const productIds = values.map(([productId]) => productId);
        const quantities = values.map(([, quantity]) => quantity);
        const updated = await tx.$queryRaw<Array<{ id: string }>>`
          UPDATE pos_products AS p
          SET stock = p.stock - v.qty
          FROM unnest(${productIds}::text[], ${quantities}::float8[])
            AS v(id, qty)
          WHERE p.id = v.id
            AND p."storeId" = ${storeId}
            AND p.stock >= v.qty
          RETURNING p.id
        `;

        if (updated.length !== expectedRowCount) {
          throw new Error("INSUFFICIENT_STOCK");
        }
      }

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

    log.error("Failed to approve transaction:", error);
    return NextResponse.json(
      { message: "Failed to approve transaction" },
      { status: 500 }
    );
  }
}


