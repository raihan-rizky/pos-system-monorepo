import { describe, it, expect } from "vitest";
import {
  MAX_PRODUCT_IMPORT_ROWS,
  importRowCommitSchema,
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

  it("allows negative decimal stock as a warning", () => {
    const records = [{ name: "Product", sku: "SKU-NEG", category: "Drinks", price: 10000, stock: -285.2, unit: "pcs" }];
    const result = normalizeImportRows(records, new Map(), categories);
    expect(result.rows[0].stock).toBe(-285.2);
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0].warnings).toContain("This stock is not supposed to be negative.");
  });

  it("defaults invalid prices to 0 as a warning", () => {
    const records = [{ name: "Product", sku: "SKU-PRICE", category: "Drinks", price: "", stock: 5, unit: "pcs" }];
    const result = normalizeImportRows(records, new Map(), categories);
    expect(result.rows[0].price).toBe(0);
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0].warnings).toContain("Price was not a valid number and will be imported as 0.");
  });

  it("defaults invalid min stock to 5 instead of sending a commit-invalid value", () => {
    const records = [{ name: "Product", sku: "SKU-MIN-STOCK", category: "Drinks", price: 10000, stock: 5, minStock: "abc", unit: "pcs" }];
    const result = normalizeImportRows(records, new Map(), categories);

    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0].minStock).toBe(5);
    expect(result.rows[0].warnings).toContain("Min stock was not a valid number and will be imported as 5.");
    expect(importRowCommitSchema.safeParse(result.rows[0]).success).toBe(true);
  });

  it("sanitizes negative optional numeric fields before commit", () => {
    const records = [{ name: "Product", sku: "SKU-OPTIONAL", category: "Drinks", price: 10000, stock: 5, costPrice: -100, minStock: -1, unit: "pcs" }];
    const result = normalizeImportRows(records, new Map(), categories);

    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0].costPrice).toBeNull();
    expect(result.rows[0].minStock).toBe(5);
    expect(result.rows[0].warnings).toContain("Cost price was not a valid number and will be imported as empty.");
    expect(result.rows[0].warnings).toContain("Min stock was not a valid number and will be imported as 5.");
    expect(importRowCommitSchema.safeParse(result.rows[0]).success).toBe(true);
  });

  it("limits to 2000 rows", () => {
    const records = Array.from({ length: 3010 }, (_, i) => ({
      name: `Product ${i}`,
      sku: `SKU-${i}`,
      category: "Drinks",
      price: 10000,
      stock: 5,
      unit: "pcs",
    }));
    const result = normalizeImportRows(records, new Map(), categories);
    expect(MAX_PRODUCT_IMPORT_ROWS).toBe(3000);
    expect(result.rows.length).toBe(MAX_PRODUCT_IMPORT_ROWS);
    expect(result.errors).toContain("Import files are limited to 3000 rows.");
  });

  it("accepts optional unit multiplier values for commit", () => {
    const records = [{ name: "Product", sku: "SKU-MULT", category: "Drinks", price: 10000, stock: 5, unit: "rim", unitMultiplierToBase: 500 }];
    const result = normalizeImportRows(records, new Map(), categories);

    expect(result.rows[0].unitMultiplierToBase).toBe(500);
    expect(importRowCommitSchema.safeParse(result.rows[0]).success).toBe(true);
  });

  it("returns correct row numbers (starting at 2 for first data row)", () => {
    const records = [{ name: "Product", sku: "SKU-1", category: "Drinks", price: 10000, stock: 5, unit: "pcs" }];
    const result = normalizeImportRows(records, new Map(), categories);
    expect(result.rows[0].rowNumber).toBe(2);
  });
});
