import { describe, expect, it } from "vitest";
import { buildProductFormPayload } from "../product-form-payload";

const formData = {
  name: "Banner Flexi",
  sku: "BNR-FLX",
  categoryId: "cat-1",
  price: "15000",
  costPrice: "9000",
  hargaDinas: "18000",
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
  it("includes pricing when creating a product", () => {
    expect(buildProductFormPayload(formData, "create")).toEqual(
      expect.objectContaining({
        price: 15000,
        costPrice: 9000,
        hargaDinas: 18000,
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
