import { describe, expect, it } from "vitest";
import {
  buildAdditionalUnitInputs, createUnitVariantDraft, getProductUnitBadges,
  normalizeProductUnitGroup, relativeUnitQuantity, resolveUnitVariantValues,
} from "../product-unit-variants";

const primary = { unit: "pcs", sku: "KERTAS-PCS", price: "2000", stock: "24" };
const box = { ...createUnitVariantDraft("box"), unit: "dus", quantity: "12" };

describe("product unit conversions", () => {
  it("uses only the original stock balance for three selling units", () => {
    const rows = buildAdditionalUnitInputs(primary, [box, { ...box, id: "pack", unit: "pak", quantity: "6" }]);
    expect(normalizeProductUnitGroup("pcs", 24, rows)).toEqual({
      baseUnit: "pcs", baseStock: 24, primaryMultiplier: 1, additionalMultipliers: [12, 6],
    });
    expect(getProductUnitBadges([box, { ...box, id: "pack", unit: "pak", quantity: "6" }]))
      .toEqual(["small", "large", "large"]);
  });

  it("normalizes smaller additions to the shared smallest unit", () => {
    const rows = [{ unit: "pcs", sku: "PCS", price: 2000, relativeQuantity: 1 / 12 }];
    expect(normalizeProductUnitGroup("dus", 2, rows)).toEqual({
      baseUnit: "pcs", baseStock: 24, primaryMultiplier: 12, additionalMultipliers: [1],
    });
    expect(getProductUnitBadges([{ ...box, unit: "pcs", direction: "smaller" }])).toEqual(["large", "small"]);
  });

  it("accepts fractional conversion counts without truncation", () => {
    expect(relativeUnitQuantity("larger", "1.5")).toBe(1.5);
    expect(relativeUnitQuantity("smaller", "1.5")).toBe(2 / 3);
  });

  it.each(["", "0", "-1", "0.5", "Infinity", "invalid"])("rejects invalid conversion %s", (quantity) => {
    expect(() => buildAdditionalUnitInputs(primary, [{ ...box, quantity }])).toThrow(/konversi/i);
  });

  it("shows neutral badges until a conversion is complete", () => {
    expect(getProductUnitBadges([])).toEqual(["primary"]);
    expect(getProductUnitBadges([createUnitVariantDraft("new")])).toEqual(["primary", "additional"]);
    expect(getProductUnitBadges([{ ...box, quantity: "1" }])).toEqual(["equal", "equal"]);
  });

  it("preserves custom price and SKU after the original price and SKU change", () => {
    const edited = { ...box, priceEdited: true, price: "22000", skuEdited: true, sku: "MANUAL" };
    expect(resolveUnitVariantValues({ ...primary, price: "3000", sku: "OTHER-PCS" }, edited))
      .toEqual({ price: "22000", sku: "MANUAL" });
    expect(resolveUnitVariantValues({ ...primary, price: "3000" }, box))
      .toEqual({ price: "36000", sku: "KERTAS-DUS" });
  });

  it("rounds suggested prices to the nearest rupiah", () => {
    expect(resolveUnitVariantValues({ ...primary, price: "1000" }, { ...box, quantity: "3", direction: "smaller" }).price)
      .toBe("333");
  });

  it("rejects a manually blank price and duplicate custom SKU", () => {
    expect(() => buildAdditionalUnitInputs(primary, [{ ...box, priceEdited: true, price: "" }])).toThrow(/harga jual/i);
    expect(() => buildAdditionalUnitInputs(primary, [{ ...box, skuEdited: true, sku: " kertas-pcs " }])).toThrow(/SKU sudah/i);
  });

  it("rejects stock normalization overflow instead of storing Infinity", () => {
    expect(() => normalizeProductUnitGroup("dus", Number.MAX_VALUE, [{ unit: "pcs", sku: "PCS", relativeQuantity: 0.5, price: 1 }]))
      .toThrow(/terlalu besar/i);
  });
});
