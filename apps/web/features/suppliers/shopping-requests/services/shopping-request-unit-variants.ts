import { db } from "@pos/db";
import { resolveProductDisplayStock } from "@/features/product-stock-groups/stock-display";

export async function listShoppingRequestUnitVariants(productId: string, storeId: string) {
  const product = await db.product.findFirst({
    where: { id: productId, storeId, isActive: true },
    select: { id: true, stockGroupId: true },
  });
  if (!product?.stockGroupId) return [];

  const variants = await db.product.findMany({
    where: { storeId, stockGroupId: product.stockGroupId, isActive: true },
    select: {
      id: true, name: true, sku: true, unit: true, stock: true,
      costPrice: true, imageUrl: true, stockGroupId: true, unitMultiplierToBase: true,
      stockGroup: { select: { id: true, displayName: true, baseUnit: true, baseStock: true } },
    },
    orderBy: [{ unitMultiplierToBase: "asc" }, { name: "asc" }],
  });
  return variants.map((variant) => ({
    ...variant,
    stock: resolveProductDisplayStock(variant),
    costPrice: variant.costPrice ? Number(variant.costPrice.toString()) : null,
  }));
}
