import { describe, expect, it } from "vitest";

import {
  findDuplicateFinalSkuGroups,
  getProductImportReadiness,
  getSuggestedDuplicateFinalSkuDecisions,
} from "../import-readiness";
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

describe("product import readiness", () => {
  it("is ready when hard blockers are resolved", () => {
    const readiness = getProductImportReadiness([row()], {});

    expect(readiness.ok).toBe(true);
    expect(readiness.notReadyRowNumbers).toEqual([]);
  });

  it("counts missing decisions as not ready", () => {
    const rows = [row({ duplicateInFile: true })];
    const readiness = getProductImportReadiness(rows, {});

    expect(readiness.ok).toBe(false);
    expect(readiness.notReadyRowNumbers).toEqual([2]);
  });

  it("counts blocking row errors as not ready", () => {
    const readiness = getProductImportReadiness(
      [row({ errors: ["Name is required."] })],
      {},
    );

    expect(readiness.ok).toBe(false);
    expect(readiness.blockersByRow[2]).toContain("Perbaiki error baris sebelum commit.");
  });

  it("does not count warnings as not ready", () => {
    const readiness = getProductImportReadiness(
      [row({ warnings: ["This stock is not supposed to be negative."] })],
      {},
    );

    expect(readiness.ok).toBe(true);
  });

  it("counts same-unit price conflict groups with two updates as not ready", () => {
    const rows = [
      row({
        rowNumber: 2,
        price: 10000,
        autoAction: "same_unit_price_conflict",
        errors: ["Same SKU/product/unit has conflicting price data."],
      }),
      row({
        rowNumber: 3,
        price: 12000,
        autoAction: "same_unit_price_conflict",
        errors: ["Same SKU/product/unit has conflicting price data."],
      }),
    ];

    const readiness = getProductImportReadiness(rows, {
      "2": "update",
      "3": "update",
    });

    expect(readiness.ok).toBe(false);
    expect(readiness.notReadyRowNumbers).toEqual([2, 3]);
  });

  it("allows same-unit price conflict groups with one update and the rest skipped", () => {
    const rows = [
      row({
        rowNumber: 2,
        price: 10000,
        autoAction: "same_unit_price_conflict",
        errors: ["Same SKU/product/unit has conflicting price data."],
      }),
      row({
        rowNumber: 3,
        price: 12000,
        autoAction: "same_unit_price_conflict",
        errors: ["Same SKU/product/unit has conflicting price data."],
      }),
    ];

    const readiness = getProductImportReadiness(rows, {
      "2": "skip",
      "3": "update",
    });

    expect(readiness.ok).toBe(true);
  });

  it("detects duplicate final SKU groups after skipped rows are excluded", () => {
    const rows = [
      row({ rowNumber: 2, sku: "STABILO-019" }),
      row({ rowNumber: 3, sku: "STABILO-019" }),
      row({ rowNumber: 4, sku: "STABILO-019" }),
    ];

    expect(findDuplicateFinalSkuGroups(rows, { "4": "skip" })).toEqual([
      {
        sku: "STABILO-019",
        rowNumbers: [2, 3],
        keepRowNumber: 2,
        skippedRowNumbers: [3],
      },
    ]);
  });

  it("keeps the duplicate row with more complete optional data", () => {
    const rows = [
      row({ rowNumber: 2, sku: "STABILO-019", price: 15000 }),
      row({
        rowNumber: 3,
        sku: "STABILO-019",
        price: 10000,
        barcode: "899",
        description: "Yellow highlighter",
      }),
    ];

    expect(findDuplicateFinalSkuGroups(rows, {})).toEqual([
      expect.objectContaining({
        keepRowNumber: 3,
        skippedRowNumbers: [2],
      }),
    ]);
  });

  it("uses highest price as the first duplicate tie-break", () => {
    const rows = [
      row({ rowNumber: 2, sku: "STABILO-019", price: 10000 }),
      row({ rowNumber: 3, sku: "STABILO-019", price: 12000 }),
    ];

    expect(findDuplicateFinalSkuGroups(rows, {})).toEqual([
      expect.objectContaining({
        keepRowNumber: 3,
        skippedRowNumbers: [2],
      }),
    ]);
  });

  it("uses lowest row number as the final duplicate tie-break", () => {
    const rows = [
      row({ rowNumber: 3, sku: "STABILO-019", price: 10000 }),
      row({ rowNumber: 2, sku: "STABILO-019", price: 10000 }),
    ];

    expect(findDuplicateFinalSkuGroups(rows, {})).toEqual([
      expect.objectContaining({
        keepRowNumber: 2,
        skippedRowNumbers: [3],
      }),
    ]);
  });

  it("suggests auto-skip decisions only for duplicate rows without explicit decisions", () => {
    const rows = [
      row({ rowNumber: 2, sku: "STABILO-019", price: 12000 }),
      row({ rowNumber: 3, sku: "STABILO-019", price: 10000 }),
      row({ rowNumber: 4, sku: "STABILO-019", price: 9000 }),
    ];

    expect(getSuggestedDuplicateFinalSkuDecisions(rows, { "4": "create" })).toEqual({
      "3": "skip",
    });
  });
});
