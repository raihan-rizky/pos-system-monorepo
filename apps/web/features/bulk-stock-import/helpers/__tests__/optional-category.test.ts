import { describe, expect, it } from "vitest";

import { buildMissingBulkStockColumns, normalizeBulkStockImportRows, applyBulkStockImportRowSelections } from "../import-core";

const product = { id: "product-1", name: "Kertas HVS", sku: "HVS-001", categoryName: "Kertas", unit: "rim", stock: 10 };
const record = { name: "Kertas HVS", unit: "rim", stock: 5 };

describe("bulk stock import without category", () => {
  it("accepts a file with only name, unit and stock columns", () => {
    expect(buildMissingBulkStockColumns(["name", "unit", "stock"])).toEqual([]);
  });

  it.each([undefined, "", "Kategori lama"])("matches only name and unit even when category is %s", (category) => {
    const input = category === undefined ? record : { ...record, category };
    const result = normalizeBulkStockImportRows([input], [product]);
    expect(result.rows[0]).toMatchObject({ status: "valid", productId: "product-1", category: "Kertas", errors: [] });
  });

  it("requires manual selection across categories and retains the chosen product", () => {
    const result = normalizeBulkStockImportRows([record], [product, { ...product, id: "product-2", sku: "HVS-002", categoryName: "ATK" }]);
    expect(result.rows[0]).toMatchObject({ status: "error", productId: null });
    expect(result.rows[0].candidates?.map(({ id }) => id)).toEqual(["product-1", "product-2"]);
    const selected = applyBulkStockImportRowSelections(result.rows, { 2: "product-2" });
    expect(selected.rows[0]).toMatchObject({ status: "valid", productId: "product-2", category: "ATK" });
  });

  it("revalidates manual selection without a category at commit time", () => {
    const result = normalizeBulkStockImportRows([{ ...record, selectedProductId: "product-2" }], [product, { ...product, id: "product-2", sku: "HVS-002", categoryName: "ATK" }]);
    expect(result.rows[0]).toMatchObject({ status: "valid", productId: "product-2", errors: [] });
  });
});
