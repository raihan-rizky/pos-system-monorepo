import { describe, expect, it } from "vitest";
import { buildProductFormPayload } from "../product-form-payload";

const formData = {
  name: "Banner Flexi",
  sku: "BNR-FLX",
  categoryId: "cat-1",
  price: "15000",
  costPrice: "9000",
  hargaDinas: "18000",
  hargaAgen: "16000",
  minStock: "5",
  unit: "meter",
  unitMultiplierToBase: "1",
  smallestUnit: "pcs",
  smallestSku: "",
  smallestBarcode: "",
  smallestPrice: "",
  smallestCostPrice: "",
  includeSmallestUnitVariant: false,
  stock: "12",
  size: "3x2m",
  material: "Flexi",
  imageUrl: "",
};

describe("buildProductFormPayload", () => {
  const addedUnit = {
    id: "unit-1", unit: "dus", direction: "larger" as const, quantity: "12",
    price: "", priceEdited: false, sku: "", skuEdited: false,
    barcode: "", costPrice: "",
  };

  it("optionally creates a larger unit with a suggested independent price", () => {
    const payload = buildProductFormPayload({
      ...formData, unit: "pcs", sku: "KERTAS-PCS", price: "2000",
      additionalUnits: [addedUnit],
    }, "create");
    expect(payload).toMatchObject({ additionalUnitVariants: [{
      unit: "dus", sku: "KERTAS-DUS", relativeQuantity: 12, price: 24000,
    }] });
  });

  it("can start with the larger unit and add a smaller selling unit", () => {
    expect(buildProductFormPayload({
      ...formData, unit: "dus", sku: "KERTAS-DUS", price: "24000",
      additionalUnits: [{ ...addedUnit, unit: "pcs", direction: "smaller" as const }],
    }, "create")).toMatchObject({ additionalUnitVariants: [{
      unit: "pcs", sku: "KERTAS-PCS", relativeQuantity: 1 / 12, price: 2000,
    }] });
  });

  it("preserves manually edited prices and SKUs including a free selling price", () => {
    expect(buildProductFormPayload({
      ...formData, unit: "pcs", sku: "KERTAS-PCS", price: "2500",
      additionalUnits: [{ ...addedUnit, price: "0", priceEdited: true, sku: "CUSTOM", skuEdited: true }],
    }, "create")).toMatchObject({ additionalUnitVariants: [{ price: 0, sku: "CUSTOM" }] });
  });

  it("does not include added units after all rows are removed or when editing", () => {
    expect(buildProductFormPayload({ ...formData, additionalUnits: [] }, "create"))
      .not.toHaveProperty("additionalUnitVariants");
    expect(buildProductFormPayload({ ...formData, additionalUnits: [addedUnit] }, "edit"))
      .not.toHaveProperty("additionalUnitVariants");
  });

  it("rejects duplicate unit names before creating a payload", () => {
    expect(() => buildProductFormPayload({
      ...formData, unit: "pcs", additionalUnits: [{ ...addedUnit, unit: " PCS " }],
    }, "create")).toThrow(/sudah digunakan/i);
  });

  it("includes pricing when creating a product", () => {
    expect(buildProductFormPayload(formData, "create")).toEqual(
      expect.objectContaining({
        price: 15000,
        costPrice: 9000,
        hargaDinas: 18000,
        hargaAgen: 16000,
      }),
    );
  });

  it("excludes pricing when editing product details", () => {
    expect(buildProductFormPayload(formData, "edit")).not.toEqual(
      expect.objectContaining({
        price: expect.anything(),
        costPrice: expect.anything(),
        priceChangeNote: expect.anything(),
      }),
    );
  });

  it("allows editing product-level Harga Dinas without regular price fields", () => {
    expect(buildProductFormPayload(formData, "edit")).toEqual(
      expect.objectContaining({
        hargaDinas: 18000,
        hargaAgen: 16000,
      }),
    );
  });

  it("includes optional brand assignment when creating and editing product details", () => {
    const valuesWithBrand = {
      ...formData,
      brandId: "brand-joyko",
    } as any;

    expect(buildProductFormPayload(valuesWithBrand, "create")).toEqual(
      expect.objectContaining({
        brandId: "brand-joyko",
      }),
    );
    expect(buildProductFormPayload(valuesWithBrand, "edit")).toEqual(
      expect.objectContaining({
        brandId: "brand-joyko",
      }),
    );
  });

  it("does not include smallest sellable variant until explicitly enabled", () => {
    expect(
      buildProductFormPayload(
        {
          ...formData,
          unit: "Dus",
          unitMultiplierToBase: "50",
        },
        "create",
      ),
    ).toEqual(
      expect.objectContaining({
        unitMultiplierToBase: 50,
        smallestUnitVariant: undefined,
      }),
    );
  });

  it("includes smallest sellable variant when explicitly enabled", () => {
    expect(
      buildProductFormPayload(
        {
          ...formData,
          unit: "Dus",
          unitMultiplierToBase: "50",
          includeSmallestUnitVariant: true,
          smallestUnit: "pcs",
          smallestSku: "BNR-PCS",
          smallestBarcode: "12345",
          smallestPrice: "500",
          smallestCostPrice: "300",
        },
        "create",
      ),
    ).toEqual(
      expect.objectContaining({
        unitMultiplierToBase: 50,
        smallestUnitVariant: {
          unit: "pcs",
          sku: "BNR-PCS",
          barcode: "12345",
          price: 500,
          costPrice: 300,
          multiplierFromPackaging: 50,
        },
      }),
    );
  });
});
