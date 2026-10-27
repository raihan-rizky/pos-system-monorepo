import { describe, expect, it } from "vitest";

import { buildAutoMapping, getMissingRequiredColumns } from "../client-parser";
import { buildMissingColumnResponse, importRowCommitSchema, normalizeImportRows } from "../import-core";
import { resolveProductImportAutoDecisions } from "../auto-decisions";

const record = { name: "Kertas HVS", sku: "HVS-001", price: 12000, unit: "rim" };
const existing = {
  id: "product-1", name: "Kertas HVS", sku: "HVS-001", category: "Kertas",
  price: 10000, costPrice: null, unit: "rim", stockGroupId: "group-1",
  stockGroupBaseUnit: "rim",
};

describe("product import without a category column", () => {
  it("accepts categoryless headers on the server and in the mapping step", () => {
    expect(buildMissingColumnResponse(["name", "sku", "price", "unit"]).missingColumns).toEqual([]);
    expect(getMissingRequiredColumns(buildAutoMapping(["Nama", "Kode", "Harga", "Satuan"]))).toEqual([]);
  });

  it.each([undefined, "", "   "])("accepts an omitted or blank category (%s) through preview and commit validation", (category) => {
    const input = category === undefined ? record : { ...record, category };
    const normalized = normalizeImportRows([input], new Map(), new Set());
    expect(normalized.errors).toEqual([]);
    expect(normalized.rows[0].errors).toEqual([]);
    expect(importRowCommitSchema.safeParse({ rowNumber: 2, ...input }).success).toBe(true);
  });

  it("places a genuinely new product into Tanpa Kategori", () => {
    const { rows } = normalizeImportRows([record], new Map(), new Set());
    const [resolved] = resolveProductImportAutoDecisions({ rows, existingProducts: [], existingSkus: new Set() });
    expect(resolved).toMatchObject({ category: "Tanpa Kategori", autoAction: "create" });
  });

  it("keeps the category of an existing SKU when the file omits category", () => {
    const { rows } = normalizeImportRows([record], new Map(), new Set(["kertas"]));
    const [resolved] = resolveProductImportAutoDecisions({ rows, existingProducts: [existing], existingSkus: new Set(["HVS-001"]) });
    expect(resolved).toMatchObject({ category: "Kertas", autoAction: "auto_price_update", matchedProductId: "product-1" });
  });

  it("recognizes a unique product by name and unit without creating a duplicate", () => {
    const { rows } = normalizeImportRows([{ ...record, sku: "IMPORT-NEW" }], new Map(), new Set(["kertas"]));
    const [resolved] = resolveProductImportAutoDecisions({ rows, existingProducts: [existing], existingSkus: new Set(["HVS-001"]) });
    expect(resolved).toMatchObject({ category: "Kertas", sku: "HVS-001", autoAction: "auto_price_update", matchedProductId: "product-1" });
  });

  it("requires a decision when categoryless name and unit match products across categories", () => {
    const { rows } = normalizeImportRows([{ ...record, sku: "IMPORT-NEW" }], new Map(), new Set());
    const [resolved] = resolveProductImportAutoDecisions({
      rows, existingProducts: [existing, { ...existing, id: "product-2", sku: "HVS-002", category: "ATK" }],
      existingSkus: new Set(["HVS-001", "HVS-002"]),
    });
    expect(resolved.autoAction).toBe("conflict");
    expect(resolved.matchedProductId).toBeUndefined();
  });

  it("links new units to the existing product category and stock group", () => {
    const { rows } = normalizeImportRows([{ ...record, sku: "IMPORT-PAK", unit: "pak" }], new Map(), new Set());
    const [resolved] = resolveProductImportAutoDecisions({ rows, existingProducts: [existing], existingSkus: new Set(["HVS-001"]) });
    expect(resolved).toMatchObject({ category: "Kertas", autoAction: "auto_create_variant", matchedStockGroupId: "group-1" });
  });

  it("honors create-new on an ambiguous categoryless row without joining an existing fallback group", () => {
    const { rows } = normalizeImportRows([{ ...record, sku: "IMPORT-NEW" }], new Map(), new Set());
    const [resolved] = resolveProductImportAutoDecisions({
      rows, existingProducts: [existing, { ...existing, id: "fallback-product", sku: "OTHER", category: "Tanpa Kategori" }],
      existingSkus: new Set(["HVS-001", "OTHER"]), decisions: { "2": "create" },
    });
    expect(resolved).toMatchObject({ autoAction: "create", category: "Tanpa Kategori" });
    expect(resolved.matchedProductId).toBeUndefined();
  });

  it("uses the fallback category when a conflicting SKU is deliberately kept as a new product", () => {
    const { rows } = normalizeImportRows([{ ...record, name: "Produk Baru" }], new Map(), new Set());
    const [resolved] = resolveProductImportAutoDecisions({
      rows, existingProducts: [existing], existingSkus: new Set(["HVS-001"]), decisions: { "2": "create" },
    });
    expect(resolved.category).toBe("Tanpa Kategori");
    expect(resolved.generatedSku).toBeTruthy();
    expect(resolved.sku).not.toBe("HVS-001");
  });
});
