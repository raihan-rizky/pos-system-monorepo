import { describe, expect, it } from "vitest";
import { normalizeImportRows } from "../import-core";
import { resolveProductImportAutoDecisions } from "../auto-decisions";

const paper = { id: "paper", name: "Buku Tulis", sku: "PAPER", category: "Kertas", unit: "pcs", price: 1000, costPrice: null, stockGroupId: "paper-group", stockGroupBaseUnit: "pcs" };
const office = { ...paper, id: "office", sku: "OFFICE", category: "ATK", stockGroupId: "office-group" };

describe("categoryless product decision scenarios", () => {
  it.each([[paper, office], [office, paper]])("uses the matching SKU to disambiguate names regardless of candidate order (%j)", (...products) => {
    const { rows } = normalizeImportRows([{ name: "Buku Tulis", sku: "OFFICE", unit: "pcs", price: 1500 }], new Map(), new Set());
    const [row] = resolveProductImportAutoDecisions({ rows, existingProducts: products, existingSkus: new Set(["PAPER", "OFFICE"]) });
    expect(row).toMatchObject({ autoAction: "auto_price_update", category: "ATK", matchedProductId: "office", sku: "OFFICE" });
  });

  it("still requires a decision when two same-unit products share the same category", () => {
    const { rows } = normalizeImportRows([{ name: "Buku Tulis", sku: "IMPORT", unit: "pcs", price: 1500 }], new Map(), new Set());
    const [row] = resolveProductImportAutoDecisions({ rows, existingProducts: [paper, { ...paper, id: "second-paper", sku: "PAPER-2" }], existingSkus: new Set(["PAPER", "PAPER-2"]) });
    expect(row.autoAction).toBe("conflict");
    expect(row.matchedProductId).toBeUndefined();
  });

  it("uses a unique same-unit candidate when another category only has a different unit", () => {
    const { rows } = normalizeImportRows([{ name: "Buku Tulis", sku: "IMPORT", unit: "pcs", price: 1500 }], new Map(), new Set());
    const [row] = resolveProductImportAutoDecisions({ rows, existingProducts: [{ ...office, unit: "pak" }, paper], existingSkus: new Set(["PAPER", "OFFICE"]) });
    expect(row).toMatchObject({ autoAction: "auto_price_update", category: "Kertas", matchedProductId: "paper" });
  });

  it("does not attach a new unit to an arbitrary category", () => {
    const { rows } = normalizeImportRows([{ name: "Buku Tulis", sku: "IMPORT", unit: "dus", price: 1500 }], new Map(), new Set());
    const [row] = resolveProductImportAutoDecisions({ rows, existingProducts: [paper, office], existingSkus: new Set(["PAPER", "OFFICE"]) });
    expect(row.autoAction).toBe("conflict");
    expect(row.matchedStockGroupId).toBeUndefined();
  });

  it("groups new categoryless units from the same file under the fallback category", () => {
    const { rows } = normalizeImportRows([
      { name: "Produk Baru", sku: "NEW-PCS", unit: "pcs", price: 1000 },
      { name: "Produk Baru", sku: "NEW-PAK", unit: "pak", price: 12000, unitMultiplierToBase: 12 },
    ], new Map(), new Set());
    const resolved = resolveProductImportAutoDecisions({ rows, existingProducts: [], existingSkus: new Set() });
    expect(resolved[0]).toMatchObject({ autoAction: "create", category: "Tanpa Kategori" });
    expect(resolved[1]).toMatchObject({ autoAction: "auto_create_variant", category: "Tanpa Kategori", matchedProductSku: "NEW-PCS", stockIgnoredForVariant: true, unitMultiplierToBase: 12 });
  });
});
