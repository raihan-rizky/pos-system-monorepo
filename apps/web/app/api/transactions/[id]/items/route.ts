import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { z } from "zod";
import {
  applyProductStockDeltas,
  StockMutationError,
} from "@/features/product-stock-groups/stock-mutations";

const patchItemsSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().nullable().optional().transform(val => val === "" ? null : val),
      productName: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      appliedUnitPrice: z.number().nonnegative(),
      originalUnitPrice: z.number().nonnegative(),
      subtotal: z.number().nonnegative(),
    })
  ),
});

// Statuses whose stock was already moved at creation and must therefore be
// reconciled when items change. PENDING_APPROVAL / DRAFT requests have not
// deducted stock yet, so editing them only rewrites lines. VOIDED / REFUNDED
// are terminal and not editable.
const STOCK_APPLIED_STATUSES = new Set(["COMPLETED", "DP"]);
const EDITABLE_STATUSES = new Set([
  "PENDING_APPROVAL",
  "DRAFT",
  "COMPLETED",
  "DP",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("transaction", "update");
    const id = (await params).id;
    const storeId = user.storeId || "store-main";

    const body = await request.json();
    const result = patchItemsSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ message: "Invalid payload", errors: result.error.issues }, { status: 400 });
    }

    const { items } = result.data;

    const existingTx = await db.transaction.findFirst({
      where: { id, storeId },
      select: {
        id: true,
        status: true,
        discount: true,
        items: { select: { productId: true, quantity: true } },
      },
    });

    if (!existingTx) {
      return NextResponse.json({ message: "Transaction not found" }, { status: 404 });
    }

    if (!EDITABLE_STATUSES.has(existingTx.status)) {
      return NextResponse.json(
        { message: `Transaksi dengan status ${existingTx.status} tidak dapat diubah` },
        { status: 409 },
      );
    }

    // Recompute every line subtotal and the transaction totals from the
    // server-side price × quantity — never trust the client-supplied subtotal.
    // Preserve the transaction's original discount.
    const normalizedItems = items.map((item) => ({
      ...item,
      subtotal: item.appliedUnitPrice * item.quantity,
    }));
    const subtotal = normalizedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const discount = Number(existingTx.discount ?? 0);
    const total = Math.max(0, subtotal - discount);

    // Build the net stock delta only for sales that already moved stock.
    // delta sign: positive restores stock, negative deducts it. We restore the
    // full old quantities and deduct the full new quantities; applyProductStockDeltas
    // merges per product, so a quantity bump nets to just the difference.
    const stockDeltas = new Map<string, number>();
    if (STOCK_APPLIED_STATUSES.has(existingTx.status)) {
      for (const old of existingTx.items) {
        if (!old.productId) continue;
        stockDeltas.set(old.productId, (stockDeltas.get(old.productId) ?? 0) + old.quantity);
      }
      for (const next of normalizedItems) {
        if (!next.productId) continue;
        stockDeltas.set(next.productId, (stockDeltas.get(next.productId) ?? 0) - next.quantity);
      }
    }
    const stockDeltaItems = Array.from(stockDeltas.entries())
      .filter(([, delta]) => delta !== 0)
      .map(([productId, delta]) => ({ productId, delta }));

    await db.$transaction(async (tx) => {
      if (stockDeltaItems.length > 0) {
        await applyProductStockDeltas(tx, {
          storeId,
          items: stockDeltaItems,
        });
      }

      await tx.transaction.update({
        where: { id },
        data: {
          subtotal,
          total,
          items: {
            deleteMany: {},
            create: normalizedItems.map(item => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              appliedUnitPrice: item.appliedUnitPrice,
              originalUnitPrice: item.originalUnitPrice,
              subtotal: item.subtotal,
            }))
          }
        }
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    if (
      error instanceof StockMutationError &&
      error.message === "INSUFFICIENT_STOCK"
    ) {
      return NextResponse.json(
        { message: "Stok produk tidak mencukupi untuk perubahan ini" },
        { status: 409 },
      );
    }

    console.error("Failed to update transaction items:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
