import { describe, expect, it } from "vitest";
import {
  getEffectiveImportDecision,
  getRowsMissingImportDecision,
} from "../import-decisions";
import type { NormalizedImportRow } from "../../types";

function row(overrides: Partial<NormalizedImportRow> = {}): NormalizedImportRow {
  return {
    rowNumber: 2,
    name: "Product",
    sku: "SKU-1",
    category: "Category",
    price: 1000,
    stock: 1,
    unit: "pcs",
    duplicateInFile: false,
    missingCategory: false,
    warnings: [],
    errors: [],
    ...overrides,
  };
}

describe("getRowsMissingImportDecision", () => {
  it("defaults auto price updates and auto variants without requiring manual decisions", () => {
    const autoPrice = row({
      rowNumber: 2,
      existingProductId: "prod-1",
      autoAction: "auto_price_update",
    });
    const autoVariant = row({
      rowNumber: 3,
      duplicateInFile: true,
      autoAction: "auto_create_variant",
    });

    expect(getEffectiveImportDecision(autoPrice, {})).toBe("update");
    expect(getEffectiveImportDecision(autoVariant, {})).toBe("create");
    expect(getRowsMissingImportDecision([autoPrice, autoVariant], {})).toEqual([]);
  });

  it("lets user row decisions override auto price and auto variant defaults", () => {
    const autoPrice = row({
      rowNumber: 2,
      existingProductId: "prod-1",
      autoAction: "auto_price_update",
    });
    const autoVariant = row({
      rowNumber: 3,
      duplicateInFile: true,
      autoAction: "auto_create_variant",
    });

    expect(getEffectiveImportDecision(autoPrice, { "2": "skip" })).toBe("skip");
    expect(getEffectiveImportDecision(autoVariant, { "3": "skip" })).toBe("skip");
  });

  it("keeps auto skip as default skip", () => {
    const autoSkip = row({
      rowNumber: 2,
      existingProductId: "prod-1",
      autoAction: "auto_skip",
    });

    expect(getEffectiveImportDecision(autoSkip, {})).toBe("skip");
    expect(getRowsMissingImportDecision([autoSkip], {})).toEqual([]);
  });

  it("defaults create auto actions so resolved duplicate rows do not need manual decisions", () => {
    const baseRow = row({
      rowNumber: 2,
      sku: "A-001",
      duplicateInFile: true,
      autoAction: "create",
    });

    expect(getEffectiveImportDecision(baseRow, {})).toBe("create");
    expect(getRowsMissingImportDecision([baseRow], {})).toEqual([]);
  });

  it("requires a decision for rows matching existing products", () => {
    const rows = [row({ existingProductId: "prod-1" })];

    expect(getRowsMissingImportDecision(rows, {})).toEqual(rows);
  });

  it("does not require a decision when existing rows have update or skip decisions", () => {
    const rows = [row({ existingProductId: "prod-1" })];

    expect(getRowsMissingImportDecision(rows, { "2": "update" })).toEqual([]);
    expect(getRowsMissingImportDecision(rows, { "2": "skip" })).toEqual([]);
  });

  it("accepts SKU-keyed decisions to match the commit API fallback", () => {
    const rows = [row({ existingProductId: "prod-1", sku: "SKU-EXISTING" })];

    expect(getRowsMissingImportDecision(rows, { "SKU-EXISTING": "skip" })).toEqual([]);
  });

  it("requires decisions for duplicate rows but not regular create rows", () => {
    const duplicate = row({ rowNumber: 3, sku: "DUP-1", duplicateInFile: true });
    const regular = row({ rowNumber: 4, sku: "NEW-1" });

    expect(getRowsMissingImportDecision([duplicate, regular], {})).toEqual([duplicate]);
  });

  it("defaults conflict rows to undefined decision and requires manual decision", () => {
    const conflict = row({
      rowNumber: 5,
      existingProductId: "prod-1",
      autoAction: "conflict",
    });

    expect(getEffectiveImportDecision(conflict, {})).toBeUndefined();
    expect(getRowsMissingImportDecision([conflict], {})).toEqual([conflict]);
    expect(getRowsMissingImportDecision([conflict], { "5": "create" })).toEqual([]);
    expect(getRowsMissingImportDecision([conflict], { "5": "create-variant" })).toEqual([]);
    expect(getRowsMissingImportDecision([conflict], { "5": "skip" })).toEqual([]);
  });

  it("requires row-level decisions for same-unit price conflicts", () => {
    const conflict = row({
      rowNumber: 6,
      duplicateInFile: true,
      autoAction: "same_unit_price_conflict",
    });

    expect(getEffectiveImportDecision(conflict, {})).toBeUndefined();
    expect(getRowsMissingImportDecision([conflict], {})).toEqual([conflict]);
    expect(getRowsMissingImportDecision([conflict], { "6": "update" })).toEqual([]);
    expect(getRowsMissingImportDecision([conflict], { "6": "skip" })).toEqual([]);
  });
});
