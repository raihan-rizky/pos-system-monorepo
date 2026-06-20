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
  it("auto-skips same product, same unit, same price, cost, and Harga Dinas", () => {
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
          hargaDinas: null,
          stockGroupId: "group-1",
          stockGroupBaseUnit: "pcs",
        },
      ],
      existingSkus: new Set(["HVS"]),
    });

    expect(resolved.autoAction).toBe("auto_skip");
    expect(resolved.matchedProductId).toBe("prod-1");
  });

  it("auto-updates when same product and unit has different Harga Dinas", () => {
    const [resolved] = resolveProductImportAutoDecisions({
      rows: [row({ name: "Fc A4", category: "Jasa", unit: "lembar", price: 500, costPrice: 100, hargaDinas: 700 })],
      existingProducts: [
        {
          id: "prod-1",
          name: "Fotocopy A4",
          sku: "FC-A4",
          category: "Jasa",
          unit: "lembar",
          price: 500,
          costPrice: 100,
          hargaDinas: 600,
          stockGroupId: "group-1",
          stockGroupBaseUnit: "lembar",
        },
      ],
      existingSkus: new Set(["FC-A4"]),
    });

    expect(resolved.autoAction).toBe("auto_price_update");
    expect(resolved.autoActionReason).toContain("Harga Dinas changed");
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
    expect(resolved.stockIgnoredForVariant).toBe(true);
    expect(resolved.autoActionReason).toContain("imported stock ignored");
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

  it("keeps the original SKU for the first same-family duplicate and generates variant SKUs for later create decisions", () => {
    const rows = [
      row({ rowNumber: 2, name: "Amplop", sku: "AMP", category: "ATK", unit: "pack" }),
      row({ rowNumber: 3, name: "Amplop", sku: "AMP", category: "ATK", unit: "pcs" }),
      row({ rowNumber: 4, name: "Amplop", sku: "AMP", category: "ATK", unit: "lusin" }),
    ];

    const resolved = resolveProductImportAutoDecisions({
      rows,
      existingProducts: [],
      existingSkus: new Set(),
      decisions: { "2": "create", "3": "create", "4": "create" },
    });

    expect(resolved[0].sku).toBe("AMP");
    expect(resolved[0].autoAction).toBe("create");
    expect(resolved[1].sku).toBe("AMP-PCS");
    expect(resolved[1].autoAction).toBe("auto_create_variant");
    expect(resolved[2].sku).toBe("AMP-LUSIN");
    expect(resolved[2].autoAction).toBe("auto_create_variant");
  });

  it("generates variant SKUs for same-family duplicate create decisions even when the unit matches", () => {
    const rows = [
      row({ rowNumber: 2, name: "Amplop", sku: "AMP", category: "ATK", unit: "pack" }),
      row({ rowNumber: 3, name: "Amplop", sku: "AMP", category: "ATK", unit: "pack" }),
    ];

    const resolved = resolveProductImportAutoDecisions({
      rows,
      existingProducts: [],
      existingSkus: new Set(),
      decisions: { "2": "create", "3": "create" },
    });

    expect(resolved[0].sku).toBe("AMP");
    expect(resolved[1].sku).toBe("AMP-PACK");
    expect(resolved[1].autoAction).toBe("auto_create_variant");
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

  it("generates a fresh SKU for conflict row when user chooses create", () => {
    const [resolved] = resolveProductImportAutoDecisions({
      rows: [row({ rowNumber: 2, name: "Amplop", category: "ATK", sku: "HVS-A4" })],
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
      decisions: { "2": "create" },
    });

    expect(resolved.autoAction).toBe("conflict");
    expect(resolved.sku).not.toBe("HVS-A4");
    expect(resolved.generatedSku).not.toBeUndefined();
  });

  it("handles create-variant decision on conflict rows by treating them as variants", () => {
    const rows = [
      row({ rowNumber: 2, name: "Amplop", category: "ATK", sku: "HVS-A4", unit: "pack" }),
      row({ rowNumber: 3, name: "Amplop", category: "ATK", sku: "HVS-A4", unit: "pcs" }),
    ];
    const resolved = resolveProductImportAutoDecisions({
      rows,
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
      decisions: { "2": "create", "3": "create-variant" },
    });

    expect(resolved[0].sku).not.toBe("HVS-A4");
    expect(resolved[1].sku).not.toBe("HVS-A4");
    expect(resolved[1].sku).not.toBe(resolved[0].sku);
  });

  it("explains that standalone rows without stock start at zero", () => {
    const [resolved] = resolveProductImportAutoDecisions({
      rows: [row({ stock: 0, stockProvided: false })],
      existingProducts: [],
      existingSkus: new Set(),
    });

    expect(resolved.autoAction).toBe("create");
    expect(resolved.autoActionReason).toContain("Stock not provided");
  });
});
