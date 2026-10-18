import { describe, expect, it } from "vitest";
import { buildAdditionalUnitInputs, createUnitVariantDraft, resolveUnitVariantValues } from "../product-unit-variants";

const primary = { unit: "pcs", sku: "BARANG-PCS", price: "2000", costPrice: "1000", stock: "24" };
const box = { ...createUnitVariantDraft("box"), unit: "dus", quantity: "12" };

describe("additional unit modal and selling price", () => {
  it("saves converted modal and defaults selling price to modal plus 35 percent", () => {
    expect(buildAdditionalUnitInputs(primary, [box])[0]).toMatchObject({ costPrice: 12000, price: 16200 });
  });
  it("updates unedited selling price when modal is changed manually", () => {
    expect(resolveUnitVariantValues(primary, { ...box, costPrice: "11000" })).toMatchObject({ costPrice: "11000", price: "14850" });
  });
  it("preserves an explicitly edited selling price when modal or conversion changes", () => {
    expect(buildAdditionalUnitInputs(primary, [{ ...box, quantity: "24", priceEdited: true, price: "30000" }])[0])
      .toMatchObject({ costPrice: 24000, price: 30000 });
  });
  it("converts modal down for a smaller additional unit", () => {
    expect(buildAdditionalUnitInputs({ ...primary, sku: "BARANG-DUS", unit: "dus", costPrice: "12000" }, [{ ...box, unit: "pcs", direction: "smaller" }])[0])
      .toMatchObject({ costPrice: 1000, price: 1350 });
  });
  it("preserves explicit zero modal instead of substituting the selling price", () => {
    expect(buildAdditionalUnitInputs(primary, [{ ...box, costPrice: "0" }])[0]).toMatchObject({ costPrice: 0, price: 0 });
  });
  it("identifies invalid modal in the visible modal field before validating selling price", () => {
    expect(() => buildAdditionalUnitInputs(primary, [{ ...box, costPrice: "-1" }])).toThrow(/harga modal/i);
  });

  it("keeps a manual zero selling price after modal and conversion change", () => {
    expect(buildAdditionalUnitInputs({ ...primary, costPrice: "2000" }, [
      { ...box, quantity: "24", priceEdited: true, price: "0" },
    ])[0]).toMatchObject({ costPrice: 48000, price: 0 });
  });

  it("rounds converted modal to cents before suggesting whole-rupiah selling price", () => {
    expect(buildAdditionalUnitInputs({ ...primary, unit: "dus", sku: "BARANG-DUS" }, [
      { ...box, unit: "pcs", quantity: "3", direction: "smaller" },
    ])[0]).toMatchObject({ costPrice: 333.33, price: 450 });
  });

  it("uses converted modal again when a manual modal is cleared", () => {
    expect(resolveUnitVariantValues(primary, { ...box, costPrice: "  " }))
      .toMatchObject({ costPrice: "12000", price: "16200" });
  });

  it("allows a manual selling price without inventing a missing modal", () => {
    const [saved] = buildAdditionalUnitInputs({ ...primary, costPrice: "" }, [
      { ...box, priceEdited: true, price: "25000" },
    ]);
    expect(saved.price).toBe(25000);
    expect(saved).not.toHaveProperty("costPrice");
  });

  it("requires a selling price when no modal can supply a suggestion", () => {
    expect(() => buildAdditionalUnitInputs({ ...primary, costPrice: "" }, [box]))
      .toThrow(/harga jual/i);
  });

  it("keeps each unit's manual modal and selling price independent", () => {
    const saved = buildAdditionalUnitInputs(primary, [
      { ...box, costPrice: "11000" },
      { ...box, id: "pak", unit: "pak", quantity: "6", priceEdited: true, price: "7500" },
    ]);
    expect(saved).toMatchObject([
      { unit: "dus", costPrice: 11000, price: 14850 },
      { unit: "pak", costPrice: 6000, price: 7500 },
    ]);
  });

  it.each(["NaN", "Infinity", "-Infinity", "abc"])("rejects malformed modal %s before saving", (costPrice) => {
    expect(() => buildAdditionalUnitInputs(primary, [{ ...box, costPrice }])).toThrow(/harga modal/i);
  });

  it.each(["", "0", "-1", "Infinity", "abc"])("rejects invalid conversion %s", (quantity) => {
    expect(() => buildAdditionalUnitInputs(primary, [{ ...box, quantity }])).toThrow(/konversi/i);
  });
});
