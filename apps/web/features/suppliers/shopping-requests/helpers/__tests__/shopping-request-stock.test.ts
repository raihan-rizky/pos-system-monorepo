import { describe, expect, it } from "vitest";

import { calculateShoppingRequestStockPreview } from "../shopping-request-stock";

const products = [
  {
    id: "sheet",
    name: "Kertas A4",
    sku: "A4-LBR",
    unit: "lembar",
    stock: 100,
    imageUrl: "/sheet.jpg",
    stockGroupId: "paper",
    unitMultiplierToBase: 1,
    conversionNeedsReview: false,
  },
  {
    id: "pack",
    name: "Kertas A4",
    sku: "A4-PACK",
    unit: "pack",
    stock: 10,
    imageUrl: "/pack.jpg",
    stockGroupId: "paper",
    unitMultiplierToBase: 10,
    conversionNeedsReview: false,
  },
  {
    id: "marker",
    name: "Spidol",
    sku: "SPD-1",
    unit: "pcs",
    stock: 4,
    imageUrl: null,
    stockGroupId: null,
    unitMultiplierToBase: 1,
    conversionNeedsReview: false,
  },
];

const groups = [
  {
    id: "paper",
    displayName: "Kertas A4",
    baseUnit: "lembar",
    baseStock: 100,
    variants: products.slice(0, 2),
  },
];

describe("calculateShoppingRequestStockPreview", () => {
  it("aggregates multiple accepted variants from one shared stock group", () => {
    const preview = calculateShoppingRequestStockPreview({
      rows: [
        { itemId: "item-sheet", productId: "sheet", stockMode: "GROUP_STOCK", quantity: 5 },
        { itemId: "item-pack", productId: "pack", stockMode: "GROUP_STOCK", quantity: 2 },
      ],
      products,
      groups,
    });

    expect(preview.groupRows).toHaveLength(1);
    expect(preview.groupRows[0]).toMatchObject({
      stockGroupId: "paper",
      beforeBaseStock: 100,
      afterBaseStock: 125,
      baseDelta: 25,
      itemIds: ["item-sheet", "item-pack"],
    });
  });

  it("previews product-only stock independently", () => {
    const preview = calculateShoppingRequestStockPreview({
      rows: [
        { itemId: "item-marker", productId: "marker", stockMode: "PRODUCT_ONLY", quantity: 3 },
      ],
      products,
      groups,
    });

    expect(preview.productRows[0]).toMatchObject({
      productId: "marker",
      beforeStock: 4,
      afterStock: 7,
      delta: 3,
    });
  });

  it("rejects Stok Bersama when conversion still needs review", () => {
    expect(() =>
      calculateShoppingRequestStockPreview({
        rows: [
          { itemId: "item-pack", productId: "pack", stockMode: "GROUP_STOCK", quantity: 2 },
        ],
        products: products.map((product) =>
          product.id === "pack" ? { ...product, conversionNeedsReview: true } : product,
        ),
        groups,
      }),
    ).toThrow("INVALID_CONVERSION");
  });
});
