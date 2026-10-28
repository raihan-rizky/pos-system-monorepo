import { describe, expect, it } from "vitest";
import { roundSellingPrice, validatePriceRoundingSettings } from "../rounding";

describe("pembulatan harga jual", () => {
  it.each([
    [0, 0, "NONE", 0], [4000, 4000, "NONE", 0],
    [4049, 4000, "DOWN", -49], [4049.99, 4000, "DOWN", -49.99],
    [4050, 4500, "UP", 450], [4500, 4500, "NONE", 0],
    [4549, 4500, "DOWN", -49], [4550, 5000, "UP", 450],
  ])("harga %s menjadi %s", (price, roundedPrice, direction, difference) => {
    expect(roundSellingPrice(Number(price))).toEqual({ originalPrice: price, roundedPrice, direction, difference });
  });

  it("mempertahankan harga asal ketika dinonaktifkan", () => {
    expect(roundSellingPrice(4050, { enabled: false, increment: 500, threshold: 50 }).roundedPrice).toBe(4050);
  });

  it("menggunakan kelipatan dan ambang tersimpan", () => {
    const settings = { enabled: true, increment: 1000, threshold: 200 };
    expect(roundSellingPrice(4199.99, settings).roundedPrice).toBe(4000);
    expect(roundSellingPrice(4200, settings).roundedPrice).toBe(5000);
  });

  it.each([
    { enabled: true, increment: 0, threshold: 0 },
    { enabled: true, increment: 500.5, threshold: 50 },
    { enabled: true, increment: 500, threshold: -1 },
    { enabled: true, increment: 500, threshold: 501 },
  ])("menolak aturan yang tidak valid: %j", settings => {
    expect(() => validatePriceRoundingSettings(settings)).toThrow();
  });

  it.each([-1, NaN, Infinity])("menolak harga tidak valid %s", price => {
    expect(() => roundSellingPrice(price)).toThrow();
  });

  it("menolak hasil yang melampaui kapasitas nilai uang", () => {
    expect(() => roundSellingPrice(9999999999.99)).toThrow();
  });
});
