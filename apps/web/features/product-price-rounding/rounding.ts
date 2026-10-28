export type PriceRoundingSettings = {
  enabled: boolean;
  increment: number;
  threshold: number;
};

export type PriceRoundingResult = {
  originalPrice: number;
  roundedPrice: number;
  direction: "UP" | "DOWN" | "NONE";
  /** Selisih harga final terhadap harga asal, negatif jika turun. */
  difference: number;
};

export const DEFAULT_PRICE_ROUNDING_SETTINGS: Readonly<PriceRoundingSettings> = Object.freeze({
  enabled: true,
  increment: 500,
  threshold: 50,
});

const MAX_MONEY_CENTS = 999_999_999_999;

export function validatePriceRoundingSettings(settings: PriceRoundingSettings): PriceRoundingSettings {
  if (typeof settings.enabled !== "boolean" ||
      !Number.isSafeInteger(settings.increment) || settings.increment < 1 || settings.increment > 1_000_000_000 ||
      !Number.isSafeInteger(settings.threshold) || settings.threshold < 0 || settings.threshold > settings.increment) {
    throw new Error("Isi kelipatan bulat positif dan ambang antara nol sampai nilai kelipatan.");
  }
  return { enabled: settings.enabled, increment: settings.increment, threshold: settings.threshold };
}

export function roundSellingPrice(
  price: number,
  settings: PriceRoundingSettings = DEFAULT_PRICE_ROUNDING_SETTINGS,
): PriceRoundingResult {
  validatePriceRoundingSettings(settings);
  if (!Number.isFinite(price) || price < 0) throw new Error("Harga jual harus berupa angka nonnegatif yang valid.");
  const cents = Math.round((price + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents) || cents > MAX_MONEY_CENTS) throw new Error("Harga jual melampaui kapasitas nilai uang.");
  const originalPrice = cents / 100;
  let roundedCents = cents;
  if (settings.enabled) {
    const step = settings.increment * 100;
    const remainder = cents % step;
    const lower = cents - remainder;
    roundedCents = remainder === 0 || remainder < settings.threshold * 100 ? lower : lower + step;
  }
  if (roundedCents > MAX_MONEY_CENTS) throw new Error("Hasil pembulatan melampaui kapasitas nilai uang.");
  const difference = (roundedCents - cents) / 100;
  return { originalPrice, roundedPrice: roundedCents / 100, direction: difference > 0 ? "UP" : difference < 0 ? "DOWN" : "NONE", difference };
}

/** Terapkan pada hasil akhir, setelah pemilihan harga member, rumus, dan harga khusus. */
export function roundSellingPriceLine<T extends { unitPrice: number; appliedPricing: { appliedUnitPrice: number } | null }>(
  line: T,
  settings: PriceRoundingSettings = DEFAULT_PRICE_ROUNDING_SETTINGS,
) {
  const rounding = roundSellingPrice(line.unitPrice, settings);
  return {
    ...line,
    unitPrice: rounding.roundedPrice,
    appliedPricing: line.appliedPricing ? { ...line.appliedPricing, appliedUnitPrice: rounding.roundedPrice } : null,
    priceRounding: rounding.direction === "NONE" ? null : rounding,
  };
}
