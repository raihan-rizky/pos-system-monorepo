import { describe, expect, it } from "vitest";

import { calculateStockGroupBulkPreview } from "../stock-group-bulk";

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
