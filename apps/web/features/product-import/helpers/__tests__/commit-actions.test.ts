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

  it("keeps auto price updates price-only even when the effective decision is update", () => {
    expect(
      getCommitActionForResolvedRow(row({ autoAction: "auto_price_update" }), "update"),
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

  it("blocks conflicts before mutating data when no decision is provided", () => {
    expect(() =>
      getCommitActionForResolvedRow(row({ autoAction: "conflict" })),
    ).toThrow("ROW_CONFLICT:2");
  });

  it("resolves conflicts based on user decisions", () => {
    expect(
      getCommitActionForResolvedRow(row({ autoAction: "conflict" }), "create"),
    ).toBe("create");
    expect(
      getCommitActionForResolvedRow(row({ autoAction: "conflict" }), "create-variant"),
    ).toBe("create-variant");
    expect(
      getCommitActionForResolvedRow(row({ autoAction: "conflict" }), "skip"),
    ).toBe("skip");
  });

  it("maps update decisions to update commit action", () => {
    expect(
      getCommitActionForResolvedRow(row(), "update"),
    ).toBe("update");
  });

  it("only allows update or skip decisions for same-unit price conflicts", () => {
    const conflict = row({ autoAction: "same_unit_price_conflict" });

    expect(getCommitActionForResolvedRow(conflict, "update")).toBe("update-price");
    expect(getCommitActionForResolvedRow(conflict, "skip")).toBe("skip");
    expect(() => getCommitActionForResolvedRow(conflict)).toThrow(
      "SAME_UNIT_PRICE_CONFLICT_ROW:2",
    );
  });
});
