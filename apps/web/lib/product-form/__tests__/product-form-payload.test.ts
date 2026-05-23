import { describe, expect, it } from "vitest";
import { buildProductFormPayload } from "../product-form-payload";

const formData = {
  name: "Banner Flexi",
  sku: "BNR-FLX",
  categoryId: "cat-1",
  price: "15000",
  costPrice: "9000",
  minStock: "5",
  unit: "meter",
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
});
