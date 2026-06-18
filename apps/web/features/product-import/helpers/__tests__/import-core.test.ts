import { describe, it, expect } from "vitest";
import {
  MAX_PRODUCT_IMPORT_ROWS,
  importRowCommitSchema,
  normalizeImportRows,
  buildMissingColumnResponse,
  extractRawHeaders,
  parseImportFile,
  normalizeHeader,
  buildCleanedImportRows,
  buildCleaningChangeLogRows,
  revertImportCleaningFixes,
} from "../import-core";

describe("buildMissingColumnResponse", () => {
  it("maps legacy catalog headers into POS import columns", () => {
    expect(normalizeHeader("Kode Item")).toBe("sku");
    expect(normalizeHeader("Nama Item")).toBe("name");
    expect(normalizeHeader("Satuan")).toBe("unit");
    expect(normalizeHeader("Konversi")).toBe("unitMultiplierToBase");
    expect(normalizeHeader("Harga Pokok")).toBe("costPrice");
    expect(normalizeHeader("Harga Level 1")).toBe("price");
    expect(normalizeHeader("Harga Level 2")).toBe("hargaDinas");
  });

  it("returns no missing columns when all required columns present", () => {
    const headers = ["name", "sku", "category", "price", "unit"];
    const result = buildMissingColumnResponse(headers);
    expect(result.missingColumns).toEqual([]);
  });

  it("returns missing columns when required columns are absent", () => {
    const headers = ["name", "sku"];
    const result = buildMissingColumnResponse(headers);
    expect(result.missingColumns).toContain("category");
    expect(result.missingColumns).toContain("price");
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

  it("defaults missing stock to 0 and tracks that stock was not provided", () => {
    const records = [{ name: "Product", sku: "SKU-NO-STOCK", category: "Drinks", price: 10000, unit: "pcs" }];
    const result = normalizeImportRows(records, new Map(), categories);

    expect(result.rows[0].stock).toBe(0);
    expect(result.rows[0].stockProvided).toBe(false);
    expect(result.rows[0].errors).toEqual([]);
    expect(importRowCommitSchema.safeParse(result.rows[0]).success).toBe(true);
  });

  it("defaults invalid prices to 0 as a warning", () => {
    const records = [{ name: "Product", sku: "SKU-PRICE", category: "Drinks", price: "", stock: 5, unit: "pcs" }];
    const result = normalizeImportRows(records, new Map(), categories);
    expect(result.rows[0].price).toBe(0);
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0].warnings).toContain("Price was not a valid number and will be imported as 0.");
  });

  it("accepts optional Harga Dinas and warns when it is below regular price", () => {
    const records = [{ name: "Product", sku: "SKU-DINAS", category: "Drinks", price: 10000, hargaDinas: 9000, unit: "pcs" }];
    const result = normalizeImportRows(records, new Map(), categories);

    expect(result.rows[0].hargaDinas).toBe(9000);
    expect(result.rows[0].warnings).toContain("Harga Dinas is lower than regular price.");
    expect(importRowCommitSchema.safeParse(result.rows[0]).success).toBe(true);
  });

  it("auto-fixes package rows when package prices are lower than small-unit prices", () => {
    const records = [
      {
        name: "Binder Clip",
        sku: "BC-001",
        category: "ATK",
        unit: "pcs",
        unitMultiplierToBase: 1,
        price: 1000,
        costPrice: 700,
        hargaDinas: 1200,
      },
      {
        name: "Binder Clip",
        sku: "BC-001",
        category: "ATK",
        unit: "dus",
        unitMultiplierToBase: 12,
        price: 900,
        costPrice: 600,
        hargaDinas: 1100,
      },
    ];

    const result = normalizeImportRows(records, new Map(), categories);

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        price: 900,
        costPrice: 600,
        hargaDinas: 1100,
        cleaningStatus: "auto_fixed",
        sourceFamilyKey: "BC-001",
      }),
    );
    expect(result.rows[1]).toEqual(
      expect.objectContaining({
        price: 1000,
        costPrice: 700,
        hargaDinas: 1200,
        cleaningStatus: "auto_fixed",
        sourceFamilyKey: "BC-001",
      }),
    );
    expect(result.rows[1].cleaningFixes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "PACKAGE_PRICE_LOWER_THAN_SMALL",
          field: "price",
          oldValue: 900,
          newValue: 1000,
        }),
        expect.objectContaining({
          ruleId: "PACKAGE_PRICE_LOWER_THAN_SMALL",
          field: "costPrice",
          oldValue: 600,
          newValue: 700,
        }),
        expect.objectContaining({
          ruleId: "PACKAGE_PRICE_LOWER_THAN_SMALL",
          field: "hargaDinas",
          oldValue: 1100,
          newValue: 1200,
        }),
      ]),
    );
    expect(result.warnings).toContain(
      "Row 3: Auto-fixed package/small price fields because package unit price was lower than small unit price.",
    );
  });

  it("marks package rows without a small-unit comparison as review required", () => {
    const records = [
      {
        name: "Amplop Coklat",
        sku: "AMP-001",
        category: "ATK",
        unit: "ball",
        unitMultiplierToBase: 100,
        price: 50000,
      },
    ];

    const result = normalizeImportRows(records, new Map(), categories);

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        cleaningStatus: "review_required",
        cleaningIssues: [
          "Package unit has no small/base unit comparison row.",
        ],
      }),
    );
    expect(result.warnings).toContain(
      "Row 2: Package unit has no small/base unit comparison row.",
    );
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

describe("cleaning export helpers", () => {
  it("builds cleaned import rows and change-log rows from preview metadata", () => {
    const normalized = normalizeImportRows(
      [
        {
          name: "Binder Clip",
          sku: "BC-001",
          category: "ATK",
          unit: "pcs",
          unitMultiplierToBase: 1,
          price: 1000,
        },
        {
          name: "Binder Clip",
          sku: "BC-001",
          category: "ATK",
          unit: "dus",
          unitMultiplierToBase: 12,
          price: 900,
        },
      ],
      new Map(),
      new Set(["atk"]),
    );

    expect(buildCleanedImportRows(normalized.rows)).toEqual([
      expect.objectContaining({
        sku: "BC-001",
        name: "Binder Clip",
        unit: "pcs",
        price: 900,
      }),
      expect.objectContaining({
        sku: "BC-001",
        name: "Binder Clip",
        unit: "dus",
        price: 1000,
      }),
    ]);
    expect(buildCleaningChangeLogRows(normalized.rows)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 2,
          sourceFamilyKey: "BC-001",
          field: "price",
          oldValue: 1000,
          newValue: 900,
          ruleId: "PACKAGE_PRICE_LOWER_THAN_SMALL",
        }),
        expect.objectContaining({
          rowNumber: 3,
          sourceFamilyKey: "BC-001",
          field: "price",
          oldValue: 900,
          newValue: 1000,
          ruleId: "PACKAGE_PRICE_LOWER_THAN_SMALL",
        }),
      ]),
    );
  });

  it("reverts auto-fixed fields back to their original values", () => {
    const normalized = normalizeImportRows(
      [
        {
          name: "Binder Clip",
          sku: "BC-001",
          category: "ATK",
          unit: "pcs",
          unitMultiplierToBase: 1,
          price: 1000,
        },
        {
          name: "Binder Clip",
          sku: "BC-001",
          category: "ATK",
          unit: "dus",
          unitMultiplierToBase: 12,
          price: 900,
        },
      ],
      new Map(),
      new Set(["atk"]),
    );

    const reverted = revertImportCleaningFixes(normalized.rows);

    expect(reverted[0]).toEqual(
      expect.objectContaining({
        price: 1000,
        cleaningStatus: "clean",
        cleaningFixes: [],
      }),
    );
    expect(reverted[1]).toEqual(
      expect.objectContaining({
        price: 900,
        cleaningStatus: "clean",
        cleaningFixes: [],
      }),
    );
  });
});
