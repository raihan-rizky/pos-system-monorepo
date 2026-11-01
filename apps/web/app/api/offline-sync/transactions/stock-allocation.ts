import { normalizeUnitMultiplier } from "@/features/product-stock-groups/stock-display";

type StockProduct = {
  id: string;
  stock: number;
  stockGroupId: string | null;
  unitMultiplierToBase: number;
  stockGroup: { baseStock: number } | null;
};

/** Allocate one shared base balance across all of its variants in sale order. */
export function allocateOfflineStock(
  products: StockProduct[],
  items: ReadonlyArray<{ productId: string; quantity: number }>,
) {
  const byProduct = new Map(products.map((product) => [product.id, product]));
  const available = new Map(products.map((product) => [
    product.id,
    product.stockGroupId ? 0 : product.stock,
  ]));
  const groupBalances = new Map<string, number>();
  for (const product of products) {
    if (product.stockGroupId && !groupBalances.has(product.stockGroupId)) {
      groupBalances.set(product.stockGroupId, Math.max(0, product.stockGroup?.baseStock ?? 0));
    }
  }

  for (const item of items) {
    const product = byProduct.get(item.productId);
    if (!product?.stockGroupId) continue;
    const multiplier = normalizeUnitMultiplier(product.unitMultiplierToBase);
    const remaining = groupBalances.get(product.stockGroupId) ?? 0;
    const quantity = Math.min(item.quantity, remaining / multiplier);
    available.set(product.id, (available.get(product.id) ?? 0) + quantity);
    groupBalances.set(product.stockGroupId, Math.max(0, remaining - quantity * multiplier));
  }
  return available;
}
