import { describe, expect, it } from "vitest";
import {
  buildAdditionalUnitInputs, createUnitVariantDraft, getProductUnitBadges,
  normalizeProductUnitGroup, relativeUnitQuantity, resolveUnitVariantValues,
  newUnitPrimaryPreview,
} from "../product-unit-variants";

const primary = { unit: "pcs", sku: "KERTAS-PCS", price: "2000", costPrice: "1000", stock: "24" };
const box = { ...createUnitVariantDraft("box"), pricingMode: "MANUAL" as const, unit: "dus", quantity: "12" };

describe("product unit conversions", () => {
  it("projects every Auto follower from the edited smaller source, matching the submitted source", () => {
    const packaging = { ...primary, unit: "pak", sku: "SN-PAK", price: "12000", costPrice: "6000" };
    const source = { ...createUnitVariantDraft("pcs"), unit: "pcs", direction: "smaller" as const, quantity: "12", pricingMode: "MANUAL" as const, priceEdited: true, price: "2000", costPrice: "800" };
    const follower = { ...createUnitVariantDraft("dus"), unit: "dus", quantity: "2" };
    const rows = [source, follower];
    expect(newUnitPrimaryPreview(packaging, rows)).toEqual({ sourceUnit: "pcs", price: "24000.00", costPrice: "9600.00" });
    expect(resolveUnitVariantValues(packaging, follower, false, rows)).toMatchObject({ price: "48000.00", costPrice: "19200" });
    expect(buildAdditionalUnitInputs(packaging, rows)).toMatchObject([
      { price: 2000, costPrice: 800 }, { pricingMode: "AUTO", price: 0, priceFactor: { numerator: "1", denominator: "1" } },
    ]);
  });
  it("rounds generated source half cents up before all follower projections", () => {
    const packaging = { ...primary, unit: "pak", sku: "SN-PAK", price: "2.01", costPrice: "2.01" };
    const source = { ...createUnitVariantDraft("pcs"), unit: "pcs", direction: "smaller" as const, quantity: "2" };
    const follower = { ...createUnitVariantDraft("dus"), unit: "dus", quantity: "3" };
    const rows = [source, follower];
    expect(buildAdditionalUnitInputs(packaging, rows)[0]).toMatchObject({ price: 1.01, costPrice: 1.01 });
    expect(newUnitPrimaryPreview(packaging, rows)).toEqual({ sourceUnit: "pcs", price: "2.02", costPrice: "2.02" });
    expect(resolveUnitVariantValues(packaging, follower, false, rows)).toMatchObject({ price: "6.06", costPrice: "6.06" });
  });
  it("normalizes an edited source once before multiplying, including primary-source groups", () => {
    const packaging = { ...primary, unit: "pak", price: "10", costPrice: "10" };
    const source = { ...createUnitVariantDraft("pcs"), unit: "pcs", direction: "smaller" as const, quantity: "2", pricingMode: "MANUAL" as const, priceEdited: true, price: "1.005", costPrice: "2.005" };
    const follower = { ...createUnitVariantDraft("dus"), unit: "dus", quantity: "3" };
    expect(newUnitPrimaryPreview(packaging, [source, follower])).toEqual({ sourceUnit: "pcs", price: "2.02", costPrice: "4.02" });
    expect(resolveUnitVariantValues(packaging, follower, false, [source, follower])).toMatchObject({ price: "6.06", costPrice: "12.06" });
    expect(resolveUnitVariantValues({ ...primary, price: "1.005", costPrice: "2.005" }, { ...follower, quantity: "2" })).toMatchObject({ price: "2.02", costPrice: "4.02" });
  });
  it("shows derived primary money when a smaller unit becomes the source", () => {
    const preview = newUnitPrimaryPreview({ ...primary, unit: "pak", sku: "SN-PAK", price: "3.33", costPrice: "2.22" }, [{ ...createUnitVariantDraft("pcs"), unit: "pcs", direction: "smaller", quantity: "12" }]);
    expect(preview).toEqual({ price: "3.36", costPrice: "2.28", sourceUnit: "pcs" });
  });
  it("keeps new source cents and automatic estimates aligned with server rounding", () => {
    const source = { ...createUnitVariantDraft("pcs"), unit: "pcs", direction: "smaller" as const, quantity: "12" };
    const [input] = buildAdditionalUnitInputs({ ...primary, unit: "pak", sku: "SN-PAK", price: "3.33", costPrice: "2.22" }, [source]);
    expect(input).toMatchObject({ price: 0.28, costPrice: 0.19 });
    expect(input).not.toHaveProperty("pricingMode");
    expect(resolveUnitVariantValues({ ...primary, price: "0.28", costPrice: "0.19" }, { ...box, pricingMode: "AUTO" }).price).toBe("3.36");
  });
  it("defaults new followers Auto and accepts explicit Manual", () => {
    expect(createUnitVariantDraft("new").pricingMode).toBe("AUTO");
    const [automatic] = buildAdditionalUnitInputs(primary, [{ ...box, pricingMode: "AUTO", price: "1", costPrice: "999" }]);
    expect(automatic).toMatchObject({ pricingMode: "AUTO", priceFactor: { numerator: "1", denominator: "1" }, price: 0 });
    expect(automatic).not.toHaveProperty("costPrice");
    expect(resolveUnitVariantValues(primary, { ...box, pricingMode: "AUTO", costPrice: "999", priceEdited: true, price: "1" })).toMatchObject({ price: "24000.00", costPrice: "12000" });
    const [manual] = buildAdditionalUnitInputs(primary, [{ ...box, pricingMode: "MANUAL", priceEdited: true, price: "22000", costPrice: "12000" }]);
    expect(manual).toMatchObject({ pricingMode: "MANUAL", price: 22000, costPrice: 12000 });
  });
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
      .toEqual({ price: "22000", costPrice: "12000", sku: "MANUAL" });
    expect(resolveUnitVariantValues({ ...primary, price: "3000" }, box))
      .toEqual({ price: "16200", costPrice: "12000", sku: "KERTAS-DUS" });
  });

  it("rounds suggested prices to the nearest rupiah", () => {
    expect(resolveUnitVariantValues({ ...primary, costPrice: "1000" }, { ...box, quantity: "3", direction: "smaller" }).price)
      .toBe("450");
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
