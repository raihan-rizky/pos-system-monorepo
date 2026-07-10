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

export function buildPosCartPriceUpdate(input: {
  productId: string;
  currentPrice: number;
  currentHargaDinas: number | null;
  currentHargaAgen: number | null;
  nextPrice: string;
  nextHargaDinas: string;
  nextHargaAgen: string;
  transactionPrice: string;
  note: string;
}) {
  const price = Number(input.nextPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Harga Normal harus lebih dari 0.");
  }
  const hargaDinas =
    input.nextHargaDinas.trim() === "" ? null : Number(input.nextHargaDinas);
  const hargaAgen =
    input.nextHargaAgen.trim() === "" ? null : Number(input.nextHargaAgen);
  const transactionPrice =
    input.transactionPrice.trim() === ""
      ? null
      : Number(input.transactionPrice);
  if (
    transactionPrice != null &&
    (!Number.isFinite(transactionPrice) || transactionPrice <= 0)
  ) {
    throw new Error("Harga Khusus harus lebih dari 0.");
  }
  const masterChanged =
    price !== input.currentPrice ||
    hargaDinas !== (input.currentHargaDinas ?? null) ||
    hargaAgen !== (input.currentHargaAgen ?? null);

  return {
    masterUpdate: masterChanged
      ? {
          id: input.productId,
          price,
          hargaDinas,
          hargaAgen,
          priceChangeNote: input.note.trim() || undefined,
        }
      : null,
    transactionPrice,
  };
}
