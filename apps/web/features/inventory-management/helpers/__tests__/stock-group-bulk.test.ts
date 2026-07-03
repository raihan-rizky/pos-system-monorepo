import { describe, expect, it } from "vitest";

import {
  calculateProductFirstStockGroupBulkPreview,
  calculateStockGroupBulkPreview,
} from "../stock-group-bulk";

const group = {
  id: "group-1",
  displayName: "Kertas A4",
  baseUnit: "lembar",
  baseStock: 100,
  variants: [
    {
      id: "sheet",
      name: "Kertas A4 Lembar",
      sku: "A4-LBR",
      unit: "lembar",
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
      stock: 100,
    },
    {
      id: "pack",
      name: "Kertas A4 Pack",
      sku: "A4-PACK",
      unit: "pack",
      unitMultiplierToBase: 10,
      conversionNeedsReview: false,
      stock: 10,
    },
  ],
};

describe("calculateStockGroupBulkPreview", () => {
  it("sets all variant stock from base-stock adjustment input", () => {
    const preview = calculateStockGroupBulkPreview({
      type: "ADJUSTMENT",
      stockInput: { mode: "BASE" },
      inputValue: 80,
      group,
    });

    expect(preview.afterBaseStock).toBe(80);
    expect(preview.variants.map((variant) => ({
      id: variant.id,
      afterStock: variant.afterStock,
      delta: variant.delta,
    }))).toEqual([
      { id: "sheet", afterStock: 80, delta: -20 },
      { id: "pack", afterStock: 8, delta: -2 },
    ]);
  });

  it("converts variant input to base stock before calculating other variants", () => {
    const preview = calculateStockGroupBulkPreview({
      type: "ADJUSTMENT",
      stockInput: { mode: "VARIANT", variantProductId: "pack" },
      inputValue: 12,
      group,
    });

    expect(preview.afterBaseStock).toBe(120);
    expect(preview.variants.find((variant) => variant.id === "sheet")?.afterStock).toBe(120);
    expect(preview.variants.find((variant) => variant.id === "pack")?.afterStock).toBe(12);
  });

  it("treats OUT input as a reduction from current base stock", () => {
    const preview = calculateStockGroupBulkPreview({
      type: "OUT",
      stockInput: { mode: "VARIANT", variantProductId: "pack" },
      inputValue: 3,
      group,
    });

    expect(preview.afterBaseStock).toBe(70);
    expect(preview.variants.find((variant) => variant.id === "sheet")?.delta).toBe(-30);
    expect(preview.variants.find((variant) => variant.id === "pack")?.delta).toBe(-3);
  });

  it("blocks negative results and invalid conversions", () => {
    expect(() =>
      calculateStockGroupBulkPreview({
        type: "OUT",
        stockInput: { mode: "BASE" },
        inputValue: 101,
        group,
      }),
    ).toThrow("NEGATIVE_STOCK");

    expect(() =>
      calculateStockGroupBulkPreview({
        type: "ADJUSTMENT",
        stockInput: { mode: "BASE" },
        inputValue: 10,
        group: {
          ...group,
          variants: [{ ...group.variants[0], conversionNeedsReview: true }],
        },
      }),
    ).toThrow("INVALID_CONVERSION");
  });
});

describe("calculateProductFirstStockGroupBulkPreview", () => {
  const products = [
    {
      id: "sheet",
      name: "Kertas A4",
      sku: "A4-LBR",
      unit: "lembar",
      stock: 100,
      stockGroupId: "group-1",
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
    },
    {
      id: "pack",
      name: "Kertas A4",
      sku: "A4-PACK",
      unit: "pack",
      stock: 10,
      stockGroupId: "group-1",
      unitMultiplierToBase: 10,
      conversionNeedsReview: false,
    },
    {
      id: "marker",
      name: "Snowman G2",
      sku: "SM-G2",
      unit: "pcs",
      stock: 12,
      stockGroupId: null,
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
    },
  ];

  const groups = [
    {
      id: "group-1",
      displayName: "Kertas A4",
      baseUnit: "lembar",
      baseStock: 100,
      variants: products.slice(0, 2),
    },
  ];

  it("expands a Stok Bersama row into every affected variant", () => {
    const preview = calculateProductFirstStockGroupBulkPreview({
      rows: [
        {
          productId: "pack",
          mode: "GROUP_STOCK",
          type: "IN",
          inputValue: 2,
        },
      ],
      products,
      groups,
    });

    expect(preview.bundledRows).toHaveLength(1);
    expect(preview.bundledRows[0]).toMatchObject({
      productId: "pack",
      stockGroupId: "group-1",
      beforeBaseStock: 100,
      afterBaseStock: 120,
      baseDelta: 20,
    });
    expect(
      preview.bundledRows[0].changedVariants.map((variant) => ({
        id: variant.id,
        afterStock: variant.afterStock,
        delta: variant.delta,
      })),
    ).toEqual([
      { id: "sheet", afterStock: 120, delta: 20 },
      { id: "pack", afterStock: 12, delta: 2 },
    ]);
  });

  it("keeps a Stok Produk Ini row standalone and marks that group stock is unchanged", () => {
    const preview = calculateProductFirstStockGroupBulkPreview({
      rows: [
        {
          productId: "pack",
          mode: "PRODUCT_ONLY",
          type: "ADJUSTMENT",
          inputValue: 8,
          note: "Opname rak depan",
        },
      ],
      products,
      groups,
    });

    expect(preview.bundledRows).toHaveLength(0);
    expect(preview.standaloneRows).toHaveLength(1);
    expect(preview.standaloneRows[0]).toMatchObject({
      productId: "pack",
      beforeStock: 10,
      afterStock: 8,
      delta: -2,
      logQuantity: -2,
      note: "Opname rak depan\nMode: Stok Produk Ini - stok grup tidak diubah",
    });
  });

  it("blocks exact duplicate selected products", () => {
    expect(() =>
      calculateProductFirstStockGroupBulkPreview({
        rows: [
          { productId: "marker", mode: "PRODUCT_ONLY", type: "OUT", inputValue: 1 },
          { productId: "marker", mode: "PRODUCT_ONLY", type: "OUT", inputValue: 1 },
        ],
        products,
        groups,
      }),
    ).toThrow("DUPLICATE_PRODUCT");
  });

  it("blocks multiple Stok Bersama rows from the same stock group", () => {
    expect(() =>
      calculateProductFirstStockGroupBulkPreview({
        rows: [
          { productId: "sheet", mode: "GROUP_STOCK", type: "OUT", inputValue: 5 },
          { productId: "pack", mode: "GROUP_STOCK", type: "OUT", inputValue: 1 },
        ],
        products,
        groups,
      }),
    ).toThrow("DUPLICATE_GROUP_STOCK");
  });
});
