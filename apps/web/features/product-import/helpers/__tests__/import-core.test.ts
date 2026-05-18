import { describe, it, expect } from "vitest";
import {
  normalizeImportRows,
  buildMissingColumnResponse,
  extractRawHeaders,
  parseImportFile,
} from "../import-core";

describe("buildMissingColumnResponse", () => {
  it("returns no missing columns when all required columns present", () => {
    const headers = ["name", "sku", "category", "price", "stock", "unit"];
    const result = buildMissingColumnResponse(headers);
    expect(result.missingColumns).toEqual([]);
  });

  it("returns missing columns when required columns are absent", () => {
    const headers = ["name", "sku"];
    const result = buildMissingColumnResponse(headers);
    expect(result.missingColumns).toContain("category");
    expect(result.missingColumns).toContain("price");
    expect(result.missingColumns).toContain("stock");
    expect(result.missingColumns).toContain("unit");
  });

  it("identifies unknown columns", () => {
    const headers = ["name", "sku", "category", "price", "stock", "unit", "foobar"];
    const result = buildMissingColumnResponse(headers);
    expect(result.unknownColumns).toContain("foobar");
  });
});

describe("normalizeImportRows", () => {
  const existingSkuMap = new Map<string, { id: string; name: string }>([
    ["SKU-001", { id: "prod-1", name: "Existing Product" }],
  ]);
  const categories = new Set(["drinks", "food"]);

  it("marks rows with existing SKUs", () => {
    const records = [{ name: "Product A", sku: "SKU-001", category: "Drinks", price: 10000, stock: 5, unit: "pcs" }];
    const result = normalizeImportRows(records, existingSkuMap, categories);
    expect(result.rows[0].existingProductId).toBe("prod-1");
    expect(result.rows[0].warnings.length).toBeGreaterThan(0);
  });

  it("marks rows with missing categories", () => {
    const records = [{ name: "Product B", sku: "SKU-NEW", category: "Electronics", price: 10000, stock: 5, unit: "pcs" }];
    const result = normalizeImportRows(records, new Map(), categories);
    expect(result.rows[0].missingCategory).toBe(true);
    expect(result.missingCategories).toContain("Electronics");
  });

  it("detects in-file duplicate SKUs", () => {
    const records = [
      { name: "Product A", sku: "DUP-001", category: "Drinks", price: 10000, stock: 5, unit: "pcs" },
      { name: "Product B", sku: "DUP-001", category: "Drinks", price: 15000, stock: 3, unit: "pcs" },
    ];
    const result = normalizeImportRows(records, new Map(), categories);
    expect(result.rows[0].duplicateInFile).toBe(true);
    expect(result.rows[1].duplicateInFile).toBe(true);
  });

  it("adds errors for missing required fields", () => {
    const records = [{ name: "", sku: "", category: "", price: "abc", stock: -1, unit: "" }];
    const result = normalizeImportRows(records, new Map(), categories);
    expect(result.rows[0].errors.length).toBeGreaterThan(0);
    expect(result.rows[0].errors.join(" ")).toContain("Name is required");
    expect(result.rows[0].errors.join(" ")).toContain("SKU is required");
  });

  it("limits to 2000 rows", () => {
    const records = Array.from({ length: 2010 }, (_, i) => ({
      name: `Product ${i}`,
      sku: `SKU-${i}`,
      category: "Drinks",
      price: 10000,
      stock: 5,
      unit: "pcs",
    }));
    const result = normalizeImportRows(records, new Map(), categories);
    expect(result.rows.length).toBe(2000);
    expect(result.errors).toContain("Import files are limited to 2000 rows.");
  });

  it("returns correct row numbers (starting at 2 for first data row)", () => {
    const records = [{ name: "Product", sku: "SKU-1", category: "Drinks", price: 10000, stock: 5, unit: "pcs" }];
    const result = normalizeImportRows(records, new Map(), categories);
    expect(result.rows[0].rowNumber).toBe(2);
  });
});
