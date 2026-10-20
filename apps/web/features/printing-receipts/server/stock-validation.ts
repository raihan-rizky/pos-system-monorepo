import type { Prisma } from "@pos/db";
import { lockStockMutationRows } from "@/features/product-stock-groups/stock-group-lock";

export class PrintingReceiptStockChangedError extends Error {}

export async function assertPrintingReceiptStockUnits(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    items: ReadonlyArray<{
      productId?: string | null;
      rawMaterialProductId?: string | null;
      rawMaterialUnit?: string | null;
    }>;
  },
) {
  const materialItems = input.items.filter((item) => item.rawMaterialProductId);
  if (materialItems.length === 0) return;

  const { storeId } = input;
  const productIds = Array.from(new Set(input.items.flatMap((item) =>
    [item.productId, item.rawMaterialProductId].filter((productId): productId is string => Boolean(productId)),
  )));
  const stockSelect = { id: true, unit: true, stockGroupId: true } as const;
  const hints = await tx.product.findMany({
    where: { storeId, id: { in: productIds } }, select: stockSelect,
  });
  const stockGroupIds = Array.from(new Set(hints.flatMap((product) =>
    product.stockGroupId ? [product.stockGroupId] : [],
  )));
  // Call after acquiring customer/invoice locks. Keep the stock writer's
  // group-then-product order and retain these locks through the deduction.
  const locks = await lockStockMutationRows(tx, { storeId, productIds, stockGroupIds });
  const currentProducts = await tx.product.findMany({
    where: { storeId, id: { in: productIds } }, select: stockSelect,
  });
  const hintById = new Map(hints.map((product) => [product.id, product]));
  const currentById = new Map(currentProducts.map((product) => [product.id, product]));
  if (
    locks.lockedProductIds.length !== productIds.length ||
    locks.lockedStockGroupIds.length !== stockGroupIds.length ||
    productIds.some((productId) => {
      const hint = hintById.get(productId);
      const current = currentById.get(productId);
      return !hint || !current || hint.stockGroupId !== current.stockGroupId;
    })
  ) {
    throw new PrintingReceiptStockChangedError("Bahan atau grup stok pada nota Percetakan sudah berubah. Periksa bahan sebelum memproses nota.");
  }
  if (materialItems.some((item) =>
    item.rawMaterialUnit !== currentById.get(item.rawMaterialProductId!)?.unit,
  )) {
    throw new PrintingReceiptStockChangedError("Satuan bahan stok pada nota Percetakan sudah berubah. Periksa bahan sebelum memproses nota.");
  }
}
