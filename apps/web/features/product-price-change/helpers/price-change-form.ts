import type { UpdateProductInput } from "@/hooks/useProducts";

type PriceInput = {
  productId: string;
  currentPrice: number;
  currentCostPrice: number | null;
  currentHargaDinas: number | null;
  nextPrice: string;
  nextCostPrice: string;
  nextHargaDinas: string;
  note: string;
};

export function buildPriceChangePayload({
  productId,
  currentPrice,
  currentCostPrice,
  currentHargaDinas,
  nextPrice,
  nextCostPrice,
  nextHargaDinas,
  note,
}: PriceInput): UpdateProductInput | null {
  const price = Number(nextPrice);
  const costPrice = nextCostPrice.trim() === "" ? null : Number(nextCostPrice);
  const hargaDinas = nextHargaDinas.trim() === "" ? null : Number(nextHargaDinas);
  const normalizedCurrentCost = currentCostPrice ?? null;
  const normalizedCurrentHargaDinas = currentHargaDinas ?? null;

  if (
    price === currentPrice &&
    costPrice === normalizedCurrentCost &&
    hargaDinas === normalizedCurrentHargaDinas
  ) {
    return null;
  }

  return {
    id: productId,
    price,
    costPrice,
    hargaDinas,
    priceChangeNote: note.trim() || undefined,
  };
}
