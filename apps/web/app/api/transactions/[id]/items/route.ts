import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { discountedLineSubtotal } from "@/features/pos-checkout/helpers/item-discount";
import { calculateTransactionTax, getTransactionTaxMethod, getTransactionTaxRate } from "@/features/transaction-tax/helpers/tax-calculation";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { z } from "zod";
import {
  applyProductStockDeltas,
  StockMutationError,
} from "@/features/product-stock-groups/stock-mutations";

const patchItemsSchema = z.object({
  items: z.array(
    z.object({
      sourceItemId: z.string().min(1).nullable().optional(),
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
        subtotal: true,
        discount: true,
        tax: true,
        taxRate: true,
        taxMethod: true,
        items: { select: { id: true, productId: true, productName: true, documentName: true, quantity: true, discount: true } },
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

    // Bind discounts to the saved line identity, never to client amounts.
    // Reserve explicit identities first so an added row cannot claim one before
    // the original row when several rows use the same product.
    const sourceIds = new Set<string>();
    for (const item of items) {
      if (!item.sourceItemId) continue;
      const source = existingTx.items.find(old => old.id === item.sourceItemId);
      if (sourceIds.has(item.sourceItemId) || !source ||
          (source.productId ?? null) !== (item.productId ?? null) ||
          (!source.productId && source.productName !== item.productName)) {
        return NextResponse.json({ message: "Identitas item tidak sesuai. Muat ulang transaksi lalu coba lagi." }, { status: 400 });
      }
      sourceIds.add(item.sourceItemId);
    }
    const normalizedItems = items.map(item => {
      let source = item.sourceItemId
        ? existingTx.items.find(old => old.id === item.sourceItemId)
        : undefined;
      if (!item.sourceItemId) {
        const matches = existingTx.items.filter(old =>
          (old.productId ?? null) === (item.productId ?? null) &&
          (old.productId || old.productName === item.productName));
        const available = matches.filter(old => !sourceIds.has(old.id));
        if (matches.length === 1 && available.length === 1) {
          source = available[0];
          sourceIds.add(source.id);
        } else if (matches.some(old => Number(old.discount ?? 0) > 0)) {
          throw new Error("ITEM_DISCOUNT_SOURCE_REQUIRED");
        }
      }
      const gross = discountedLineSubtotal(item.appliedUnitPrice, item.quantity);
      const discount = Math.min(gross, Math.max(0, Number(source?.discount ?? 0)));
      return { ...item, sourceItemId: source?.id ?? null, discount, subtotal: discountedLineSubtotal(item.appliedUnitPrice, item.quantity, discount) };
    });
    const subtotal = normalizedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const discount = Number(existingTx.discount ?? 0);
    const { tax, total } = calculateTransactionTax({
      subtotal, discount,
      taxRate: getTransactionTaxRate(existingTx),
      taxMethod: getTransactionTaxMethod(existingTx),
    });

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
      // Refresh saved names only after locking the parent, so a concurrent
      // document-name save cannot be overwritten by the earlier item snapshot.
      await tx.$queryRaw`
        SELECT "id" FROM "pos_transactions"
        WHERE "id" = ${id} AND "storeId" = ${storeId}
        FOR UPDATE
      `;
      const current = await tx.transaction.findFirst({
        where: { id, storeId },
        select: { status: true, items: { select: { id: true, documentName: true } } },
      });
      const previousIds = new Set(existingTx.items.map(item => item.id));
      if (!current || current.status !== existingTx.status ||
          current.items.length !== existingTx.items.length ||
          current.items.some(item => !previousIds.has(item.id))) {
        throw new Error("TRANSACTION_ITEMS_CHANGED");
      }
      const currentNames = new Map(current.items.map(item => [item.id, item.documentName]));
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
          tax,
          total,
          items: {
            deleteMany: {},
            create: normalizedItems.map(item => ({
              productId: item.productId,
              productName: item.productName,
              documentName: item.sourceItemId ? currentNames.get(item.sourceItemId) ?? null : null,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              appliedUnitPrice: item.appliedUnitPrice,
              originalUnitPrice: item.originalUnitPrice,
              subtotal: item.subtotal,
              discount: item.discount,
            }))
          }
        }
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    if (error instanceof Error && error.message === "TRANSACTION_ITEMS_CHANGED") {
      return NextResponse.json({ message: "Item atau status transaksi sudah berubah. Muat ulang transaksi lalu coba lagi." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ITEM_DISCOUNT_SOURCE_REQUIRED") {
      return NextResponse.json({ message: "Pilih identitas item yang sesuai agar diskon tetap tersimpan. Muat ulang transaksi lalu coba lagi." }, { status: 400 });
    }

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
