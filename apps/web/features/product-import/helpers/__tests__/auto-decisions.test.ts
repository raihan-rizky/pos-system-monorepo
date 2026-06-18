import { describe, expect, it } from "vitest";

import { resolveProductImportAutoDecisions } from "../auto-decisions";
import type { NormalizedImportRow } from "../../types";

function row(overrides: Partial<NormalizedImportRow> = {}): NormalizedImportRow {
  return {
    rowNumber: 2,
    name: "Kertas HVS",
    sku: "IMP-1",
    category: "Kertas",
    price: 10000,
    stock: 10,
    unit: "rim",
    duplicateInFile: false,
    missingCategory: false,
    warnings: [],
    errors: [],
    ...overrides,
  };
}

describe("resolveProductImportAutoDecisions", () => {
  it("auto-skips same product, same unit, same price and cost", () => {
    const [resolved] = resolveProductImportAutoDecisions({
      rows: [row({ name: "hvs", category: "ATK", unit: "PCS", price: 1500, costPrice: 1000 })],
      existingProducts: [
        {
          id: "prod-1",
          name: "HVS",
          sku: "HVS",
          category: "atk",
          unit: "pcs",
          price: 1500,
          costPrice: 1000,
          stockGroupId: "group-1",
          stockGroupBaseUnit: "pcs",
        },
      ],
      existingSkus: new Set(["HVS"]),
    });

    expect(resolved.autoAction).toBe("auto_skip");
    expect(resolved.matchedProductId).toBe("prod-1");
  });

  it("auto-updates only price and cost for same product and same unit when price data differs", () => {
    const [resolved] = resolveProductImportAutoDecisions({
      rows: [row({ name: "Fc A4", category: "Jasa", unit: "lembar", price: 500, costPrice: 100 })],
      existingProducts: [
        {
          id: "prod-1",
          name: "Fotocopy A4",
          sku: "FC-A4",
          category: "Jasa",
          unit: "lembar",
          price: 400,
          costPrice: 90,
          stockGroupId: "group-1",
          stockGroupBaseUnit: "lembar",
        },
      ],
      existingSkus: new Set(["FC-A4"]),
    });

    expect(resolved.autoAction).toBe("auto_price_update");
    expect(resolved.autoActionReason).toContain("price/cost changed");
  });

  it("auto-creates a different-unit variant with a fresh SKU in the same group", () => {
    const [resolved] = resolveProductImportAutoDecisions({
      rows: [row({ name: "Kertas HVS", category: "Kertas", unit: "lembar", sku: "STALE-SKU" })],
      existingProducts: [
        {
          id: "prod-1",
          name: "Kertas HVS",
          sku: "HVS-A4",
          category: "Kertas",
          unit: "rim",
          price: 10000,
          costPrice: null,
          stockGroupId: "group-1",
          stockGroupBaseUnit: "lembar",
        },
      ],
      existingSkus: new Set(["HVS-A4", "HVS-A4-LEMBAR"]),
    });

    expect(resolved.autoAction).toBe("auto_create_variant");
    expect(resolved.generatedSku).toBe("HVS-A4-LEMBAR-2");
    expect(resolved.matchedStockGroupId).toBe("group-1");
  });

  it("resolves in-file duplicates in row order", () => {
    const rows = [
      row({ rowNumber: 2, name: "MsnTik", sku: "MSN", category: "ATK", unit: "pcs", price: 10000 }),
      row({ rowNumber: 3, name: "Mesin Tik", sku: "MSN-RIBBON", category: "atk", unit: "Ribbon", price: 2000 }),
    ];

    const [, variant] = resolveProductImportAutoDecisions({
      rows,
      existingProducts: [],
      existingSkus: new Set(),
    });

    expect(variant.autoAction).toBe("auto_create_variant");
    expect(variant.generatedSku).toBe("MSN-RIBBON");
  });

  it("marks same SKU with different normalized product as a conflict", () => {
    const [resolved] = resolveProductImportAutoDecisions({
      rows: [row({ name: "Amplop", category: "ATK", sku: "HVS-A4" })],
      existingProducts: [
        {
          id: "prod-1",
          name: "Kertas HVS",
          sku: "HVS-A4",
          category: "Kertas",
          unit: "rim",
          price: 10000,
          costPrice: null,
          stockGroupId: "group-1",
          stockGroupBaseUnit: "lembar",
        },
      ],
      existingSkus: new Set(["HVS-A4"]),
    });

    expect(resolved.autoAction).toBe("conflict");
  });
});
