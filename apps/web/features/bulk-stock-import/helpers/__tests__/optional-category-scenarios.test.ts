import { describe, expect, it } from "vitest";
import { buildBulkStockImportImpacts, normalizeBulkStockImportRows } from "../import-core";

const product = { id: "paper", name: "Kertas HVS", sku: "PAPER", categoryName: "Kertas", unit: "rim", stock: 10 };

describe("categoryless bulk stock quantity scenarios", () => {
  it.each([
    { mode: "ADD" as const, quantity: 8, delta: 8, afterStock: 18 },
    { mode: "SET" as const, quantity: 3, delta: -7, afterStock: 3 },
  ])("aggregates duplicate rows using $mode even with different legacy categories", ({ mode, quantity, delta, afterStock }) => {
    const normalized = normalizeBulkStockImportRows([
      { name: "Kertas HVS", unit: "rim", stock: 5 },
      { name: "kertas hvs", category: "Kategori Lama", unit: "RIM", stock: 3 },
    ], [product]);
    expect(normalized.summary).toMatchObject({ validRows: 2, errorRows: 0, warningRows: 2 });
    expect(buildBulkStockImportImpacts(normalized.rows, [product], mode)).toEqual([
      expect.objectContaining({ productId: "paper", quantity, delta, afterStock }),
    ]);
  });

  it("keeps manually selected identical names in separate stock impacts", () => {
    const products = [product, { ...product, id: "office", sku: "OFFICE", categoryName: "ATK", stock: 20 }];
    const normalized = normalizeBulkStockImportRows([
      { name: "Kertas HVS", unit: "rim", category: "ATK", stock: 5, selectedProductId: "paper" },
      { name: "Kertas HVS", unit: "rim", category: "Kertas", stock: 3, selectedProductId: "office" },
    ], products);
    expect(normalized.summary.errorRows).toBe(0);
    expect(buildBulkStockImportImpacts(normalized.rows, products, "ADD")).toEqual([
      expect.objectContaining({ productId: "paper", quantity: 5, afterStock: 15 }),
      expect.objectContaining({ productId: "office", quantity: 3, afterStock: 23 }),
    ]);
  });

  it.each([
    { selectedProductId: "missing", unit: "rim" },
    { selectedProductId: "paper", unit: "pak" },
  ])("blocks a stale selection instead of producing a stock write (%j)", selection => {
    const normalized = normalizeBulkStockImportRows([{ name: "Kertas HVS", stock: 5, ...selection }], [product]);
    expect(normalized.rows[0].status).toBe("error");
    expect(buildBulkStockImportImpacts(normalized.rows, [product], "ADD")).toEqual([]);
  });
});
