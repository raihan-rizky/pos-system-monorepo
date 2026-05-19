/**
 * Pure helpers for the batched stock-decrement step of POS checkout.
 *
 * The route uses these to build a single SQL statement that decrements
 * stock for every cart line in one round-trip, instead of N sequential
 * `updateMany` calls inside the locked interactive transaction.
 */

export interface StockDecrementCartItem {
  productId: string;
  quantity: number;
}

export interface StockDecrementParams {
  /** [productId, mergedQuantity] tuples in first-seen order. */
  values: Array<[string, number]>;
  storeId: string;
  /** Number of distinct rows we expect the UPDATE to touch. */
  expectedRowCount: number;
}

/**
 * Build the parameters for the batched stock decrement.
 *
 * - Drops items with empty productId or non-positive / non-finite quantity.
 * - Merges duplicate productId entries by summing quantities, preserving
 *   the first-seen order so the resulting SQL is deterministic.
 */
export function buildStockDecrementParams(
  items: ReadonlyArray<StockDecrementCartItem>,
  storeId: string,
): StockDecrementParams {
  const order: string[] = [];
  const totals = new Map<string, number>();

  for (const item of items) {
    if (!item.productId) continue;
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) continue;

    if (!totals.has(item.productId)) {
      order.push(item.productId);
      totals.set(item.productId, item.quantity);
    } else {
      totals.set(item.productId, totals.get(item.productId)! + item.quantity);
    }
  }

  const values: Array<[string, number]> = order.map((productId) => [
    productId,
    totals.get(productId)!,
  ]);

  return {
    values,
    storeId,
    expectedRowCount: values.length,
  };
}
