import type { ShoppingRequestItemInput } from "../types/shopping-request";
import type { Product } from "@/hooks/useProducts";

/**
 * Builds a shopping request number: DPB-YYYYMM-XXX
 * @param date — creation date
 * @param sequence — 1-based sequence for the month
 */
export function buildShoppingRequestNumber(date: Date, sequence: number): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `DPB-${year}${month}-${String(sequence).padStart(3, "0")}`;
}

/**
 * Removes invalid (non-positive qty) and duplicates by productId keeping last.
 */
export function sanitizeShoppingRequestItems(
  items: ShoppingRequestItemInput[],
): ShoppingRequestItemInput[] {
  const byProduct = new Map<string, ShoppingRequestItemInput>();
  for (const item of items) {
    if (item.requestedQty > 0) {
      byProduct.set(item.productId, item);
    }
  }
  return Array.from(byProduct.values());
}

/**
 * Jumlah yang Di-ACC harus diputuskan secara eksplisit sebelum approval.
 */
export function defaultApprovedQty(_requestedQty: number): null {
  return null;
}

export function isLargeUnitShoppingProduct(product: {
  unitMultiplierToBase?: number | null;
}): boolean {
  const multiplier = product.unitMultiplierToBase;
  return (
    typeof multiplier === "number" &&
    Number.isFinite(multiplier) &&
    multiplier > 1
  );
}

export function getLargeUnitShoppingProducts(products: Product[]): Product[] {
  return products.flatMap((product) => {
    if (!product.variants?.length) {
      return isLargeUnitShoppingProduct(product) ? [product] : [];
    }

    return product.variants
      .filter(isLargeUnitShoppingProduct)
      .map((variant) => ({
        ...product,
        id: variant.id,
        unit: variant.unit,
        price: variant.price,
        costPrice: variant.costPrice,
        stock: variant.stock,
        sku: variant.sku,
        unitMultiplierToBase: variant.unitMultiplierToBase,
        stockGroup: variant.stockGroup,
        hargaDinas: variant.hargaDinas,
        hargaAgen: variant.hargaAgen,
        barcode: variant.barcode ?? product.barcode,
        size: variant.size ?? product.size,
        material: variant.material ?? product.material,
        brandId: variant.brandId ?? product.brandId,
        brand: variant.brand ?? product.brand,
        defaultVariant: {
          id: variant.id,
          unit: variant.unit,
          price: variant.price,
          stock: variant.stock,
          sku: variant.sku,
        },
      }));
  });
}
