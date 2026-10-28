import { describe, expect, it } from "vitest";
import { roundSellingPrice, roundSellingPriceLine, validatePriceRoundingSettings, type PriceRoundingSettings } from "../rounding";

describe("batas dan sifat pembulatan harga jual", () => {
  it.each([
    { increment: 1, threshold: 0 },
    { increment: 100, threshold: 25 },
    { increment: 500, threshold: 50 },
    { increment: 500, threshold: 500 },
    { increment: 1000, threshold: 200 },
  ])("tetap berurutan dan tidak berubah jika dibulatkan lagi: %j", parameters => {
    const settings = { enabled: true, ...parameters };
    let previous = -1;
    for (let cents = 0; cents <= 200000; cents += 37) {
      const price = cents / 100;
      const result = roundSellingPrice(price, settings);
      expect(result.roundedPrice).toBeGreaterThanOrEqual(previous);
      expect(result.roundedPrice % settings.increment).toBe(0);
      expect(roundSellingPrice(result.roundedPrice, settings).direction).toBe("NONE");
      expect(Math.round(result.difference * 100)).toBe(Math.round((result.roundedPrice - price) * 100));
      previous = result.roundedPrice;
    }
  });

  it.each([
    [0, 0, 0], [0.01, 500, 0], [49.99, 500, 0], [50, 500, 0],
    [499.99, 500, 0], [500, 500, 500], [500.01, 1000, 500],
  ])("mendukung ambang nol dan ambang sama dengan kelipatan pada harga %s", (price, ceiling, floor) => {
    expect(roundSellingPrice(price, { enabled: true, increment: 500, threshold: 0 }).roundedPrice).toBe(ceiling);
    expect(roundSellingPrice(price, { enabled: true, increment: 500, threshold: 500 }).roundedPrice).toBe(floor);
  });

  it.each([0, 0.01, 49.99, 50, 499.99])("mengulang aturan yang sama pada setiap blok untuk sisa %s", remainder => {
    const first = roundSellingPrice(remainder);
    for (const base of [500, 4000, 1000000]) {
      const repeated = roundSellingPrice(base + remainder);
      expect(repeated.roundedPrice).toBe(base + first.roundedPrice);
      expect(repeated.direction).toBe(first.direction);
      expect(repeated.difference).toBe(first.difference);
    }
  });

  it.each([[4049.994, 4049.99, 4000], [4049.995, 4050, 4500], [4549.995, 4550, 5000]])(
    "menentukan ambang setelah normalisasi dua desimal: %s", (input, normalized, expected) => {
      expect(roundSellingPrice(input)).toMatchObject({ originalPrice: normalized, roundedPrice: expected });
    },
  );

  it("menerima batas uang saat dinonaktifkan dan menolak overflow hasil pembulatan", () => {
    expect(roundSellingPrice(9999999999.99, { enabled: false, increment: 500, threshold: 50 }).roundedPrice).toBe(9999999999.99);
    expect(() => roundSellingPrice(9999999999.99)).toThrow(/kapasitas/);
    expect(() => roundSellingPrice(10000000000, { enabled: false, increment: 500, threshold: 50 })).toThrow(/kapasitas/);
    expect(roundSellingPrice(1000000000.01, { enabled: true, increment: 1000000000, threshold: 0 }).roundedPrice).toBe(2000000000);
  });

  it.each([
    { enabled: "true", increment: 500, threshold: 50 },
    { enabled: true, increment: Number.NaN, threshold: 50 },
    { enabled: true, increment: Number.POSITIVE_INFINITY, threshold: 50 },
    { enabled: true, increment: 500, threshold: Number.NaN },
    { enabled: true, increment: 500, threshold: Number.POSITIVE_INFINITY },
    { enabled: false, increment: 500, threshold: 501 },
  ])("tetap memvalidasi pengaturan runtime: %j", value => {
    expect(() => validatePriceRoundingSettings(value as PriceRoundingSettings)).toThrow();
  });

  it("mempertahankan objek harga asal dan HPP ketika metadata akhir diperbarui", () => {
    const original = Object.freeze({ unitPrice: 4050, costPrice: 2345.67, appliedPricing: Object.freeze({ appliedUnitPrice: 4050, originalUnitPrice: 4500 }) });
    const result = roundSellingPriceLine(original);
    expect(result.unitPrice).toBe(4500);
    expect(result.costPrice).toBe(2345.67);
    expect(result.appliedPricing).toEqual({ appliedUnitPrice: 4500, originalUnitPrice: 4500 });
    expect(result.priceRounding).toMatchObject({ direction: "UP", difference: 450 });
    expect(original.appliedPricing.appliedUnitPrice).toBe(4050);
    expect(original.unitPrice).toBe(4050);
    expect(roundSellingPriceLine(original, { enabled: false, increment: 500, threshold: 50 }).priceRounding).toBeNull();
  });
});
