import type { UpdateProductInput } from "@/hooks/useProducts";

type PriceInput = {
  productId: string;
  currentPrice: number;
  currentCostPrice: number | null;
  currentHargaDinas: number | null;
  currentHargaAgen: number | null;
  nextPrice: string;
  nextCostPrice: string;
  nextHargaDinas: string;
  nextHargaAgen: string;
  note: string;
};

export function buildPriceChangePayload({
  productId,
  currentPrice,
  currentCostPrice,
  currentHargaDinas,
  currentHargaAgen,
  nextPrice,
  nextCostPrice,
  nextHargaDinas,
  nextHargaAgen,
  note,
}: PriceInput): UpdateProductInput | null {
  const price = Number(nextPrice);
  const costPrice = nextCostPrice.trim() === "" ? null : Number(nextCostPrice);
  const hargaDinas = nextHargaDinas.trim() === "" ? null : Number(nextHargaDinas);
  const hargaAgen = nextHargaAgen.trim() === "" ? null : Number(nextHargaAgen);
  const normalizedCurrentCost = currentCostPrice ?? null;
  const normalizedCurrentHargaDinas = currentHargaDinas ?? null;
  const normalizedCurrentHargaAgen = currentHargaAgen ?? null;

  if (
    price === currentPrice &&
    costPrice === normalizedCurrentCost &&
    hargaDinas === normalizedCurrentHargaDinas &&
    hargaAgen === normalizedCurrentHargaAgen
  ) {
    return null;
  }

  return {
    id: productId,
    price,
    costPrice,
    hargaDinas,
    hargaAgen,
    priceChangeNote: note.trim() || undefined,
  };
}
