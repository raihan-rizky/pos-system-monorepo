export type StockLikeCartItem = {
  stock?: number | null;
};

export function shouldConfirmNegativeStock(items: ReadonlyArray<StockLikeCartItem>): boolean {
  return items.some((item) => typeof item.stock === "number" && item.stock <= 0);
}
