import { describe, expect, it } from "vitest";

import { getCommitActionForResolvedRow } from "../commit-actions";
import type { NormalizedImportRow } from "../../types";

function row(overrides: Partial<NormalizedImportRow> = {}): NormalizedImportRow {
  return {
    rowNumber: 2,
    name: "Fotocopy A4",
    sku: "IMPORT-1",
    category: "Jasa",
    price: 500,
    stock: 99,
    unit: "lembar",
    costPrice: 100,
    duplicateInFile: false,
    missingCategory: false,
    warnings: [],
    errors: [],
    ...overrides,
  };
}

describe("getCommitActionForResolvedRow", () => {
  it("maps auto skip rows to SKIP without requiring a manual decision", () => {
    expect(
      getCommitActionForResolvedRow(row({ autoAction: "auto_skip" })),
    ).toBe("skip");
  });

  it("maps auto price updates to update without changing stock semantics", () => {
    expect(
      getCommitActionForResolvedRow(row({ autoAction: "auto_price_update" })),
    ).toBe("update-price");
  });

  it("maps auto variants to create variant", () => {
    expect(
      getCommitActionForResolvedRow(row({ autoAction: "auto_create_variant" })),
    ).toBe("create-variant");
  });

  it("lets explicit user decisions override auto price and auto variant actions", () => {
    expect(
      getCommitActionForResolvedRow(row({ autoAction: "auto_price_update" }), "skip"),
    ).toBe("skip");
    expect(
      getCommitActionForResolvedRow(row({ autoAction: "auto_create_variant" }), "skip"),
    ).toBe("skip");
  });

  it("blocks conflicts before mutating data", () => {
    expect(() =>
      getCommitActionForResolvedRow(row({ autoAction: "conflict" })),
    ).toThrow("ROW_CONFLICT:2");
  });
});
