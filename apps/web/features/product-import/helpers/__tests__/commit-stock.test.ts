import { describe, expect, it } from "vitest";

import { resolveImportCreateStockPlan } from "../commit-stock";

describe("resolveImportCreateStockPlan", () => {
  it("defaults standalone products with missing stock to zero without a stock log", () => {
    expect(
      resolveImportCreateStockPlan({
        commitAction: "create",
        rowStock: 0,
        stockProvided: false,
        multiplier: 1,
      }),
    ).toEqual({
      productStock: 0,
      groupBaseStock: 0,
      inventoryLogQuantity: null,
    });
  });

  it("ignores variant row stock and derives display stock from existing group", () => {
    expect(
      resolveImportCreateStockPlan({
        commitAction: "create-variant",
        rowStock: 999,
        stockProvided: true,
        multiplier: 500,
        matchedGroupBaseStock: 1000,
      }),
    ).toEqual({
      productStock: 2,
      groupBaseStock: 1000,
      inventoryLogQuantity: null,
    });
  });
});
