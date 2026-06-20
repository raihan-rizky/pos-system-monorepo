import { describe, expect, it } from "vitest";

import { filterRowsByProductImportSearch } from "../import-search";
import type { NormalizedImportRow } from "../../types";

function row(overrides: Partial<NormalizedImportRow> = {}): NormalizedImportRow {
  return {
    rowNumber: 2,
    name: "Stabilo Boss",
    sku: "STABILO-019",
    category: "ATK",
    price: 10000,
    stock: 0,
    unit: "pcs",
    duplicateInFile: false,
    missingCategory: false,
    warnings: [],
    errors: [],
    ...overrides,
  };
}

describe("product import search", () => {
  const rows = [
    row(),
    row({ rowNumber: 3, name: "Pulpen Biru", sku: "PULPEN-001" }),
  ];

  it("matches product names case-insensitively", () => {
    expect(filterRowsByProductImportSearch(rows, "stabilo")).toEqual([rows[0]]);
  });

  it("matches SKUs case-insensitively and trims search text", () => {
    expect(filterRowsByProductImportSearch(rows, "  pulpen-001  ")).toEqual([rows[1]]);
  });

  it("does not search category, unit, or price", () => {
    expect(filterRowsByProductImportSearch(rows, "ATK")).toEqual([]);
    expect(filterRowsByProductImportSearch(rows, "pcs")).toEqual([]);
    expect(filterRowsByProductImportSearch(rows, "10000")).toEqual([]);
  });

  it("returns all rows for an empty search", () => {
    expect(filterRowsByProductImportSearch(rows, " ")).toEqual(rows);
  });
});
