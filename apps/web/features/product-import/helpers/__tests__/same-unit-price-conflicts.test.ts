import { describe, expect, it } from "vitest";

import {
  applySameUnitPriceConflicts,
  findSameUnitPriceConflictGroups,
  validateSameUnitPriceConflictDecisions,
} from "../same-unit-price-conflicts";
import type { NormalizedImportRow } from "../../types";

function row(overrides: Partial<NormalizedImportRow> = {}): NormalizedImportRow {
  return {
    rowNumber: 2,
    name: "Fc A4",
    sku: "A01",
    category: "Jasa",
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

describe("same-unit price conflicts", () => {
  it("detects same SKU/name/category/unit rows with different price data", () => {
    const groups = findSameUnitPriceConflictGroups([
      row({ rowNumber: 2, price: 10000 }),
      row({ rowNumber: 3, price: 12000 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      sku: "A01",
      unit: "pcs",
      rowNumbers: [2, 3],
    });
  });

  it("includes cost price and Harga Dinas in price conflict detection", () => {
    expect(
      findSameUnitPriceConflictGroups([
        row({ rowNumber: 2, costPrice: 8000 }),
        row({ rowNumber: 3, costPrice: 8500 }),
      ]),
    ).toHaveLength(1);
    expect(
      findSameUnitPriceConflictGroups([
        row({ rowNumber: 2, hargaDinas: 15000 }),
        row({ rowNumber: 3, hargaDinas: 16000 }),
      ]),
    ).toHaveLength(1);
  });

  it("ignores same SKU/unit rows when normalized product identity differs", () => {
    const groups = findSameUnitPriceConflictGroups([
      row({ rowNumber: 2, name: "Fc A4", price: 10000 }),
      row({ rowNumber: 3, name: "Amplop", price: 12000 }),
    ]);

    expect(groups).toHaveLength(0);
  });

  it("marks every row in a conflict group for explicit intervention", () => {
    const rows = applySameUnitPriceConflicts([
      row({ rowNumber: 2, price: 10000 }),
      row({ rowNumber: 3, price: 12000 }),
    ]);

    expect(rows.map((candidate) => candidate.autoAction)).toEqual([
      "same_unit_price_conflict",
      "same_unit_price_conflict",
    ]);
    expect(rows.every((candidate) => candidate.errors.length > 0)).toBe(true);
  });

  it("allows all skip or one update, and rejects missing or multiple update decisions", () => {
    const rows = [
      row({ rowNumber: 2, price: 10000 }),
      row({ rowNumber: 3, price: 12000 }),
    ];

    expect(validateSameUnitPriceConflictDecisions(rows, {}).ok).toBe(false);
    expect(validateSameUnitPriceConflictDecisions(rows, { "2": "update", "3": "update" }).ok).toBe(false);
    expect(validateSameUnitPriceConflictDecisions(rows, { "2": "update", "3": "skip" }).ok).toBe(true);
    expect(validateSameUnitPriceConflictDecisions(rows, { "2": "skip", "3": "skip" }).ok).toBe(true);
  });
});
