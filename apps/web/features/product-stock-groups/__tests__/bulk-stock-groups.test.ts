import { describe, expect, it } from "vitest";

import {
  buildSharedStockInventoryLogRows,
  calculateVariantMargin,
  generateVariantSku,
  resolveConfirmedGroupStock,
  resolveConversionEdit,
  resolveMultipliersFromConversionPairs,
  resolveSharedBaseStock,
} from "../bulk-stock-groups";

describe("bulk stock group helpers", () => {
  it("converts variant stock input into base stock using the selected variant multiplier", () => {
    expect(
      resolveSharedBaseStock({
        sharedStock: 3,
        stockInput: { mode: "VARIANT", variantProductId: "rim" },
        variants: [
          { id: "rim", unitMultiplierToBase: 500 },
          { id: "pack", unitMultiplierToBase: 100 },
        ],
      }),
    ).toBe(1500);
  });

  it("plans one inventory adjustment log row per active variant", () => {
    const rows = buildSharedStockInventoryLogRows({
      groupDisplayName: "Kertas A4",
      oldBaseStock: 1000,
      newBaseStock: 1500,
      variants: [
        { id: "rim", unitMultiplierToBase: 500 },
        { id: "pack", unitMultiplierToBase: 100 },
      ],
      actor: { id: "owner-1", name: "Owner" },
      note: "Stock opname group",
    });

    expect(rows).toEqual([
      expect.objectContaining({
        productId: "rim",
        type: "ADJUSTMENT",
        reason: "MANUAL_ADJUSTMENT",
        quantity: 1,
        note: "Stock opname group",
        createdBy: "owner-1",
        person: "Owner",
      }),
      expect.objectContaining({
        productId: "pack",
        quantity: 5,
      }),
    ]);
  });

  it("resolves multipliers from pair conversions relative to the source product", () => {
    const variants = resolveMultipliersFromConversionPairs({
      sourceProductId: "rim",
      variants: [
        { id: "rim", unit: "rim", stock: 10 },
        { id: "dus", unit: "dus", stock: 2 },
        { id: "lembar", unit: "lembar", stock: 5000 },
      ],
      conversionPairs: [
        {
          fromProductId: "dus",
          fromQuantity: 1,
          toProductId: "rim",
          toQuantity: 5,
        },
        {
          fromProductId: "rim",
          fromQuantity: 1,
          toProductId: "lembar",
          toQuantity: 500,
        },
      ],
    });

    expect(variants).toEqual([
      expect.objectContaining({ id: "rim", unitMultiplierToBase: 1 }),
      expect.objectContaining({ id: "dus", unitMultiplierToBase: 5 }),
      expect.objectContaining({ id: "lembar", unitMultiplierToBase: 0.002 }),
    ]);
  });

  it("uses source product stock as the authoritative base stock", () => {
    const result = resolveConfirmedGroupStock({
      sourceProductId: "rim",
      products: [
        { id: "rim", unit: "rim", stock: 10 },
        { id: "dus", unit: "dus", stock: 1 },
      ],
      assignments: [{ productId: "rim" }, { productId: "dus" }],
      conversionPairs: [
        {
          fromProductId: "dus",
          fromQuantity: 1,
          toProductId: "rim",
          toQuantity: 5,
        },
      ],
    });

    expect(result.baseStock).toBe(10);
    expect(result.baseUnit).toBe("rim");
    expect(result.conflictWarnings).toEqual([
      expect.objectContaining({
        productId: "dus",
        currentStock: 1,
        convertedStock: 2,
      }),
    ]);
    expect(result.conversionPairs[0]?.label).toBe("1 dus = 5 rim");
  });

  it("rejects duplicate active units in one confirmed group", () => {
    expect(() =>
      resolveConfirmedGroupStock({
        sourceProductId: "rim-1",
        products: [
          { id: "rim-1", unit: "rim", stock: 10 },
          { id: "rim-2", unit: "rim", stock: 2 },
        ],
        assignments: [{ productId: "rim-1" }, { productId: "rim-2" }],
        conversionPairs: [
          {
            fromProductId: "rim-2",
            fromQuantity: 1,
            toProductId: "rim-1",
            toQuantity: 1,
          },
        ],
      }),
    ).toThrow("DUPLICATE_UNIT");
  });

  it("preserves selected source stock when conversion rates change", () => {
    const result = resolveConversionEdit({
      mode: "PRESERVE_SOURCE_STOCK",
      sourceProductId: "rim",
      currentBaseStock: 20,
      variants: [
        { id: "rim", unit: "rim", stock: 20, unitMultiplierToBase: 1 },
        { id: "dus", unit: "dus", stock: 4, unitMultiplierToBase: 5 },
      ],
      conversionPairs: [
        {
          fromProductId: "dus",
          fromQuantity: 1,
          toProductId: "rim",
          toQuantity: 4,
        },
      ],
    });

    expect(result.nextBaseStock).toBe(20);
    expect(result.variants).toEqual([
      expect.objectContaining({ id: "rim", unitMultiplierToBase: 1 }),
      expect.objectContaining({ id: "dus", unitMultiplierToBase: 4 }),
    ]);
    expect(result.preview).toEqual([
      expect.objectContaining({
        productId: "rim",
        oldDisplayStock: 20,
        newDisplayStock: 20,
      }),
      expect.objectContaining({
        productId: "dus",
        oldDisplayStock: 4,
        newDisplayStock: 5,
      }),
    ]);
  });

  it("keeps shared stock fixed when conversion rates change without source preservation", () => {
    const result = resolveConversionEdit({
      mode: "KEEP_SHARED_STOCK",
      currentBaseStock: 20,
      variants: [
        { id: "rim", unit: "rim", stock: 20, unitMultiplierToBase: 1 },
        { id: "dus", unit: "dus", stock: 4, unitMultiplierToBase: 5 },
      ],
      conversionPairs: [
        {
          fromProductId: "dus",
          fromQuantity: 1,
          toProductId: "rim",
          toQuantity: 4,
        },
      ],
    });

    expect(result.nextBaseStock).toBe(20);
    expect(result.preview.find((row) => row.productId === "dus")).toEqual(
      expect.objectContaining({
        oldDisplayStock: 4,
        newDisplayStock: 5,
      }),
    );
  });

  it("re-bases shared stock when selected base unit changes", () => {
    const result = resolveConversionEdit({
      mode: "KEEP_SHARED_STOCK",
      currentBaseProductId: "pcs",
      baseProductId: "dus",
      currentBaseStock: 48,
      variants: [
        { id: "pcs", unit: "pcs", stock: 48, unitMultiplierToBase: 1 },
        { id: "dus", unit: "dus", stock: 0.96, unitMultiplierToBase: 50 },
      ],
      directMultipliers: [
        { productId: "pcs", unitMultiplierToBase: 0.02 },
        { productId: "dus", unitMultiplierToBase: 1 },
      ],
    });

    expect(result.nextBaseStock).toBe(0.96);
    expect(result.variants).toEqual([
      expect.objectContaining({ id: "pcs", unitMultiplierToBase: 0.02 }),
      expect.objectContaining({ id: "dus", unitMultiplierToBase: 1 }),
    ]);
    expect(result.preview).toEqual([
      expect.objectContaining({
        productId: "pcs",
        oldDisplayStock: 48,
        newDisplayStock: 48,
      }),
      expect.objectContaining({
        productId: "dus",
        oldDisplayStock: 0.96,
        newDisplayStock: 0.96,
      }),
    ]);
  });

  it("requires source product when preserving source stock", () => {
    expect(() =>
      resolveConversionEdit({
        mode: "PRESERVE_SOURCE_STOCK",
        currentBaseStock: 20,
        variants: [
          { id: "rim", unit: "rim", stock: 20, unitMultiplierToBase: 1 },
          { id: "dus", unit: "dus", stock: 4, unitMultiplierToBase: 5 },
        ],
        conversionPairs: [
          {
            fromProductId: "dus",
            fromQuantity: 1,
            toProductId: "rim",
            toQuantity: 4,
          },
        ],
      }),
    ).toThrow("SOURCE_PRODUCT_REQUIRED");
  });

  it("reports negative margin as warning without blocking save", () => {
    expect(calculateVariantMargin({ price: 10000, costPrice: 12000 })).toEqual({
      amount: -2000,
      percentage: -20,
      warning: "NEGATIVE_MARGIN",
      canSave: true,
    });
  });

  it("generates new variant SKU from SKU family and unit suffix", () => {
    expect(generateVariantSku({ sourceSku: "HVS-A4-RIM", unit: "dus" })).toBe(
      "HVS-A4-DUS",
    );
  });
});
