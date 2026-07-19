import type { ShoppingRequestItemInput } from "../types/shopping-request";
import type { ShoppingRequestStockMode } from "../types/shopping-request";

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

export function defaultShoppingRequestStockMode(
  stockGroupId: string | null | undefined,
): ShoppingRequestStockMode {
  return stockGroupId ? "GROUP_STOCK" : "PRODUCT_ONLY";
}
