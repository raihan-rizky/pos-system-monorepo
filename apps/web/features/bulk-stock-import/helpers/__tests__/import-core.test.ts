import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  applyBulkStockImportRowSelections,
  applyBulkStockImportSetModeSkips,
  applyBulkStockImportStockChanges,
  buildBulkStockImportImpacts,
  buildMissingBulkStockColumns,
  normalizeBulkStockHeader,
  normalizeBulkStockImportRows,
} from "../import-core";
import { parseBulkStockImportFile } from "../import-file.server";

const products = [
  {
    id: "prod-a",
    name: "Kertas HVS A4",
    sku: "SKU-A",
    categoryName: "ATK",
    unit: "Rim",
    stock: 10,
  },
  {
    id: "prod-b",
    name: "Pulpen Pilot",
    sku: "SKU-B",
    categoryName: "ATK",
    unit: "pcs",
    stock: 7,
  },
  {
    id: "prod-dup-1",
    name: "Map Plastik",
    sku: "SKU-DUP-1",
    categoryName: "ATK",
    unit: "pcs",
    stock: 3,
  },
  {
    id: "prod-dup-2",
    name: "Map Plastik",
    sku: "SKU-DUP-2",
    categoryName: "ATK",
    unit: "pcs",
    stock: 9,
  },
];

describe("bulk stock import core", () => {
  it("parses workbook rows with stock import aliases", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Name Product", "Kategori", "Satuan", "Stok"],
      ["Kertas HVS A4", "ATK", "Rim", 5],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

    const parsed = await parseBulkStockImportFile(buffer);

    expect(parsed).toEqual({
      headers: ["name", "category", "unit", "stock"],
      records: [
        {
          name: "Kertas HVS A4",
          category: "ATK",
          unit: "Rim",
          stock: "5",
        },
      ],
    });
  });

  it("parses semicolon CSV rows with Indonesian number formats", async () => {
    const csv = [
      "sku;name;category;stock;unit;costPrice;price;minStock",
      "A-001;Acco plastik Joyko;ATK;182,00;Dus;7.600,00;12.000,00;50,00",
    ].join("\n");
    const buffer = new TextEncoder().encode(csv).buffer;

    const parsed = await parseBulkStockImportFile(buffer);

    expect(parsed).toEqual({
      headers: [
        "sku",
        "name",
        "category",
        "stock",
        "unit",
        "costprice",
        "price",
        "minstock",
      ],
      records: [
        {
          sku: "A-001",
          name: "Acco plastik Joyko",
          category: "ATK",
          stock: "182,00",
          unit: "Dus",
          costprice: "7.600,00",
          price: "12.000,00",
          minstock: "50,00",
        },
      ],
    });

    const preview = normalizeBulkStockImportRows(
      [
        {
          name: "Acco plastik Joyko",
          category: "ATK",
          unit: "Dus",
          stock: parsed.records[0].stock,
        },
      ],
      [
        {
          id: "prod-acco",
          name: "Acco plastik Joyko",
          sku: "A-001",
          categoryName: "ATK",
          unit: "Dus",
          stock: 7,
        },
      ],
    );

    expect(preview.rows[0]).toEqual(
      expect.objectContaining({
        status: "valid",
        stock: 182,
      }),
    );
  });

  it("keeps cell alignment when the sheet contains blank header columns", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Name Product", "", "Kategori", "Satuan", "Stok"],
      ["Kertas HVS A4", "ignored", "ATK", "Rim", 5],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

    const parsed = await parseBulkStockImportFile(buffer);

    expect(parsed.records[0]).toEqual({
      name: "Kertas HVS A4",
      category: "ATK",
      unit: "Rim",
      stock: "5",
    });
  });

  it("parses text decimal stock without treating decimal dots as thousands", () => {
    const result = normalizeBulkStockImportRows(
      [{ name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: "1.5" }],
      products,
    );

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: "valid",
        stock: 1.5,
      }),
    );
  });

  it("parses Indonesian thousands stock with dot separators", () => {
    const result = normalizeBulkStockImportRows(
      [{ name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: "1.000" }],
      products,
    );

    expect(result.rows[0].stock).toBe(1000);
  });

  it("normalizes accepted stock import header aliases", () => {
    expect(normalizeBulkStockHeader("Name Product")).toBe("name");
    expect(normalizeBulkStockHeader("Nama Produk")).toBe("name");
    expect(normalizeBulkStockHeader("Kategori")).toBe("category");
    expect(normalizeBulkStockHeader("Satuan")).toBe("unit");
    expect(normalizeBulkStockHeader("Stok")).toBe("stock");
  });

  it("requires name, category, unit, and stock columns", () => {
    expect(buildMissingBulkStockColumns(["name", "stock"])).toEqual([
      "category",
      "unit",
    ]);
  });

  it("matches rows case-insensitively and skips unmatched products", () => {
    const result = normalizeBulkStockImportRows(
      [
        { name: "kertas hvs a4", category: "atk", unit: "rim", stock: 5 },
        { name: "Produk Hilang", category: "ATK", unit: "pcs", stock: 2 },
      ],
      products,
    );

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: "valid",
        productId: "prod-a",
        stock: 5,
      }),
    );
    expect(result.rows[1]).toEqual(
      expect.objectContaining({
        status: "skipped",
        productId: null,
      }),
    );
    expect(result.summary).toEqual({
      validRows: 1,
      skippedRows: 1,
      errorRows: 0,
      warningRows: 0,
    });
  });

  it("aggregates duplicate rows for add mode and uses last row for set mode", () => {
    const preview = normalizeBulkStockImportRows(
      [
        { name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: 5 },
        { name: "kertas hvs a4", category: "atk", unit: "rim", stock: 3 },
        { name: "Pulpen Pilot", category: "ATK", unit: "pcs", stock: 4 },
      ],
      products,
    );

    expect(preview.rows[0].warnings).toContain(
      "Duplicate product row. Add mode will aggregate quantities; set mode will use the last row.",
    );
    expect(
      buildBulkStockImportImpacts(preview.rows, products, "ADD"),
    ).toEqual([
      expect.objectContaining({
        productId: "prod-a",
        quantity: 8,
        delta: 8,
        afterStock: 18,
        sourceRowNumbers: [2, 3],
      }),
      expect.objectContaining({
        productId: "prod-b",
        quantity: 4,
        delta: 4,
        afterStock: 11,
        sourceRowNumbers: [4],
      }),
    ]);
    expect(
      buildBulkStockImportImpacts(preview.rows, products, "SET"),
    ).toEqual([
      expect.objectContaining({
        productId: "prod-a",
        quantity: 3,
        delta: -7,
        afterStock: 3,
        sourceRowNumbers: [3],
      }),
      expect.objectContaining({
        productId: "prod-b",
        quantity: 4,
        delta: -3,
        afterStock: 4,
        sourceRowNumbers: [4],
      }),
    ]);
  });

  it("adds projected before and after stock values for preview rows", () => {
    const preview = normalizeBulkStockImportRows(
      [
        { name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: 5 },
        { name: "kertas hvs a4", category: "atk", unit: "rim", stock: 3 },
        { name: "Pulpen Pilot", category: "ATK", unit: "pcs", stock: 4 },
      ],
      products,
    );

    expect(applyBulkStockImportStockChanges(preview.rows, "ADD")).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        beforeStock: 10,
        afterStock: 18,
      }),
      expect.objectContaining({
        rowNumber: 3,
        beforeStock: 10,
        afterStock: 18,
      }),
      expect.objectContaining({
        rowNumber: 4,
        beforeStock: 7,
        afterStock: 11,
      }),
    ]);
    expect(applyBulkStockImportStockChanges(preview.rows, "SET")).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        beforeStock: 10,
        afterStock: 3,
      }),
      expect.objectContaining({
        rowNumber: 3,
        beforeStock: 10,
        afterStock: 3,
      }),
      expect.objectContaining({
        rowNumber: 4,
        beforeStock: 7,
        afterStock: 4,
      }),
    ]);
  });

  it("returns candidates for ambiguous product matches", () => {
    const result = normalizeBulkStockImportRows(
      [{ name: "Map Plastik", category: "ATK", unit: "pcs", stock: 2 }],
      products,
    );

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: "error",
        productId: null,
        errors: ["Matched product is ambiguous."],
        candidates: [
          expect.objectContaining({ id: "prod-dup-1", sku: "SKU-DUP-1" }),
          expect.objectContaining({ id: "prod-dup-2", sku: "SKU-DUP-2" }),
        ],
      }),
    );
  });

  it("skips unchanged valid rows for set mode preview only", () => {
    const preview = normalizeBulkStockImportRows(
      [
        { name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: 10 },
        { name: "Pulpen Pilot", category: "ATK", unit: "pcs", stock: 8 },
      ],
      products,
    );

    const setResult = applyBulkStockImportSetModeSkips(preview.rows, "SET");
    const addResult = applyBulkStockImportSetModeSkips(preview.rows, "ADD");

    expect(setResult.rows[0]).toEqual(
      expect.objectContaining({
        status: "skipped",
        productId: "prod-a",
        notes: ["Stock is unchanged."],
      }),
    );
    expect(setResult.rows[1]).toEqual(
      expect.objectContaining({
        status: "valid",
        productId: "prod-b",
      }),
    );
    expect(setResult.summary).toEqual({
      validRows: 1,
      skippedRows: 1,
      errorRows: 0,
      warningRows: 0,
    });
    expect(addResult.rows[0]).toEqual(
      expect.objectContaining({
        status: "valid",
        productId: "prod-a",
      }),
    );
  });

  it("omits zero-delta impacts for set mode after last-row-wins", () => {
    const preview = normalizeBulkStockImportRows(
      [
        { name: "Kertas HVS A4", category: "ATK", unit: "Rim", stock: 15 },
        { name: "kertas hvs a4", category: "atk", unit: "rim", stock: 10 },
        { name: "Pulpen Pilot", category: "ATK", unit: "pcs", stock: 8 },
      ],
      products,
    );

    expect(
      buildBulkStockImportImpacts(preview.rows, products, "SET"),
    ).toEqual([
      expect.objectContaining({
        productId: "prod-b",
        quantity: 8,
        delta: 1,
      }),
    ]);
  });

  it("resolves ambiguous product matches with an explicit selected product", () => {
    const result = normalizeBulkStockImportRows(
      [
        {
          name: "Map Plastik",
          category: "ATK",
          unit: "pcs",
          stock: 2,
          selectedProductId: "prod-dup-2",
        },
      ],
      products,
    );

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: "valid",
        productId: "prod-dup-2",
        sku: "SKU-DUP-2",
        errors: [],
        warnings: ["Duplicate products exist; selected manually."],
      }),
    );
  });

  it("rejects selected products that no longer match the row identity", () => {
    const result = normalizeBulkStockImportRows(
      [
        {
          name: "Map Plastik",
          category: "ATK",
          unit: "pcs",
          stock: 2,
          selectedProductId: "prod-a",
        },
      ],
      products,
    );

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: "error",
        productId: null,
        errors: ["Selected product no longer matches this row."],
      }),
    );
  });

  it("applies preview row selections to ambiguous rows", () => {
    const preview = normalizeBulkStockImportRows(
      [{ name: "Map Plastik", category: "ATK", unit: "pcs", stock: 2 }],
      products,
    );

    const result = applyBulkStockImportRowSelections(preview.rows, {
      2: "prod-dup-2",
    });

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: "valid",
        productId: "prod-dup-2",
        sku: "SKU-DUP-2",
        selectedProductId: "prod-dup-2",
        errors: [],
        warnings: ["Duplicate products exist; selected manually."],
      }),
    );
    expect(result.summary).toEqual({
      validRows: 1,
      skippedRows: 0,
      errorRows: 0,
      warningRows: 1,
    });
  });
});
