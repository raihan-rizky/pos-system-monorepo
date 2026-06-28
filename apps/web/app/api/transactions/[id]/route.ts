import { NextResponse } from "next/server";
import { after } from "next/server";
import { db, Prisma } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { z } from "zod";

import { getLogger } from "@/lib/logger";
import { applyProductStockDeltas } from "@/features/product-stock-groups/stock-mutations";

const log = getLogger("api:transactions:id");
const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
};

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  COMPLETED: ["DP", "VOIDED", "REFUNDED"],
  DP: ["COMPLETED", "VOIDED"],
  PENDING_APPROVAL: ["COMPLETED", "VOIDED"],
  VOIDED: [],
  REFUNDED: [],
};

/** Statuses that have side effects that must be reversed when voiding */
const VOID_REVERSIBLE = new Set(["COMPLETED", "DP"]);

const updateTransactionSchema = z.object({
  salesName: z.string().optional().nullable(),
  salespersonId: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]).optional(),
  status: z.enum(["COMPLETED", "DP", "VOIDED", "REFUNDED", "PENDING_APPROVAL"]).optional(),
});

// GET /api/transactions/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("transaction", "read");
    const storeId = user.storeId || "store-main";
    const { id } = await params;

    const transaction = await db.transaction.findFirst({
      where: { id, storeId },
      include: {
        cashier: { select: { name: true } },
        salesperson: { select: { name: true } },
        items: {
          include: {
            product: { select: { unit: true } },
            printingService: { select: { unit: true } },
          },
        },
      },
    });

    if (!transaction) {
      return NextResponse.json(
        { message: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    const createdAt = toIsoString(transaction.createdAt) ?? new Date(0).toISOString();

    return NextResponse.json({
      ...transaction,
      createdAt,
      items: transaction.items.map((item) => ({
        ...item,
        createdAt:
          toIsoString((item as { createdAt?: Date | string | null }).createdAt) ?? createdAt,
      })),
    });
  } catch (error: any) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch transaction:", error);
    return NextResponse.json(
      { message: "Failed to fetch transaction" },
      { status: 500 }
    );
  }
}

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

    // ── Void reversal: restore stock, reverse inventory logs & customer analytics ──
    if (status === "VOIDED" && VOID_REVERSIBLE.has(existingTransaction.status)) {
      // Run entire void (update + side-effects) atomically
      await db.$transaction(async (tx) => {
        const voidedTx = await tx.transaction.update({
          where: { id },
          data: updateData,
          select: {
            id: true,
            invoiceNumber: true,
            customerId: true,
            total: true,
            amountPaid: true,
            status: true,
            items: {
              select: {
                productId: true,
                productName: true,
                quantity: true,
                unitCost: true,
              },
            },
          },
        });

        const productItems = voidedTx.items.filter(
          (item): item is typeof item & { productId: string } =>
            item.productId !== null,
        );

        // 1. Restore stock
        await applyProductStockDeltas(tx as any, {
          storeId,
          items: productItems.map((item) => ({
            productId: item.productId,
            delta: item.quantity,
          })),
          allowNegative: true,
        });

        // 2. Inventory log entries
        if (productItems.length > 0) {
          await tx.inventoryLog.createMany({
            data: productItems.map((item) => ({
              productId: item.productId,
              type: "IN" as const,
              reason: "SALE_RETURN" as const,
              quantity: item.quantity,
              unitCost: item.unitCost === null || item.unitCost === undefined
                ? null
                : Number(item.unitCost.toString()),
              note: `Void transaksi ${voidedTx.invoiceNumber} - ${item.productName}`,
              createdBy: user.id,
              person: user.name ?? null,
            })),
          });
        }

        // 3. Reverse customer analytics
        if (voidedTx.customerId) {
          const existingCustomer = await tx.customer.findUnique({
            where: { id: voidedTx.customerId },
            select: { totalSpent: true, totalOrders: true, totalDebt: true },
          });

          if (existingCustomer) {
            const total = Number(voidedTx.total);
            const amountPaid = Math.min(Number(voidedTx.amountPaid), total);
            const wasDp = existingTransaction.status === "DP";
            const debtDecrement = wasDp ? Math.max(0, total - amountPaid) : 0;

            await tx.customer.update({
              where: { id: voidedTx.customerId },
              data: {
                totalSpent: Math.max(0, Number(existingCustomer.totalSpent) - amountPaid),
                totalOrders: Math.max(0, existingCustomer.totalOrders - 1),
                ...(debtDecrement > 0
                  ? { totalDebt: Math.max(0, Number(existingCustomer.totalDebt) - debtDecrement) }
                  : {}),
              },
            });
          }
        }

        return voidedTx;
      });

      const updated = await db.transaction.findUniqueOrThrow({
        where: { id },
        include: {
          items: {
            select: {
              id: true,
              productName: true,
              size: true,
              material: true,
              quantity: true,
              unitPrice: true,
              pricingRuleId: true,
              pricingCustomerType: true,
              pricingCategoryId: true,
              pricingCategoryName: true,
              pricingMode: true,
              pricingValue: true,
              originalUnitPrice: true,
              appliedUnitPrice: true,
              subtotal: true,
              productId: true,
              unitCost: true,
            },
          },
          cashier: { select: { name: true } },
        },
      });
      return NextResponse.json(updated);
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
            pricingRuleId: true,
            pricingCustomerType: true,
            pricingCategoryId: true,
            pricingCategoryName: true,
            pricingMode: true,
            pricingValue: true,
            originalUnitPrice: true,
            appliedUnitPrice: true,
            subtotal: true,
            productId: true,
            unitCost: true,
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
      select: { id: true, status: true },
    });

    if (!existingTransaction) {
      return NextResponse.json(
        { message: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    // Fetch full transaction for side-effect reversal (only if not already voided)
    if (existingTransaction.status !== "VOIDED") {
      const txToRevert = await db.transaction.findUnique({
        where: { id },
        select: {
          id: true,
          invoiceNumber: true,
          customerId: true,
          total: true,
          amountPaid: true,
          status: true,
          items: {
            select: {
              productId: true,
              productName: true,
              quantity: true,
              unitCost: true,
            },
          },
        },
      });

      if (txToRevert) {
        const productItems = txToRevert.items.filter(
          (item): item is typeof item & { productId: string } =>
            item.productId !== null,
        );

        // Delete + stock restore + log + customer update — all atomic
        await db.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.transactionItem.deleteMany({ where: { transactionId: id } });
          await tx.transaction.delete({ where: { id } });

          if (productItems.length > 0) {
            await applyProductStockDeltas(tx as any, {
              storeId,
              items: productItems.map((item) => ({
                productId: item.productId,
                delta: item.quantity,
              })),
              allowNegative: true,
            });

            await tx.inventoryLog.createMany({
              data: productItems.map((item) => ({
                productId: item.productId,
                type: "IN" as const,
                reason: "SALE_RETURN" as const,
                quantity: item.quantity,
                unitCost:
                  item.unitCost === null || item.unitCost === undefined
                    ? null
                    : Number(item.unitCost.toString()),
                note: `Delete transaksi ${txToRevert.invoiceNumber} - ${item.productName}`,
                createdBy: user.id,
                person: user.name ?? null,
              })),
            });
          }

          if (txToRevert.customerId) {
            const existingCustomer = await tx.customer.findUnique({
              where: { id: txToRevert.customerId },
              select: { totalSpent: true, totalOrders: true, totalDebt: true },
            });

            if (existingCustomer) {
              const total = Number(txToRevert.total);
              const amountPaid = Math.min(Number(txToRevert.amountPaid), total);
              const wasDp = txToRevert.status === "DP";
              const debtDecrement = wasDp ? Math.max(0, total - amountPaid) : 0;

              await tx.customer.update({
                where: { id: txToRevert.customerId },
                data: {
                  totalSpent: Math.max(0, Number(existingCustomer.totalSpent) - amountPaid),
                  totalOrders: Math.max(0, existingCustomer.totalOrders - 1),
                  ...(debtDecrement > 0
                    ? { totalDebt: Math.max(0, Number(existingCustomer.totalDebt) - debtDecrement) }
                    : {}),
                },
              });
            }
          }
        });
        return new NextResponse(null, { status: 204 });
      }
    }

    // No stock to restore — just delete atomically
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
