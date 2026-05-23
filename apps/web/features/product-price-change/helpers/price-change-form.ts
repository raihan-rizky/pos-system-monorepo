import type { UpdateProductInput } from "@/hooks/useProducts";

type PriceInput = {
  productId: string;
  currentPrice: number;
  currentCostPrice: number | null;
  nextPrice: string;
  nextCostPrice: string;
  note: string;
};

export function buildPriceChangePayload({
  productId,
  currentPrice,
  currentCostPrice,
  nextPrice,
  nextCostPrice,
  note,
}: PriceInput): UpdateProductInput | null {
  const price = Number(nextPrice);
  const costPrice = nextCostPrice.trim() === "" ? null : Number(nextCostPrice);
  const normalizedCurrentCost = currentCostPrice ?? null;

  if (price === currentPrice && costPrice === normalizedCurrentCost) {
    return null;
  }

  return {
    id: productId,
    price,
    costPrice,
    priceChangeNote: note.trim() || undefined,
  };
}
