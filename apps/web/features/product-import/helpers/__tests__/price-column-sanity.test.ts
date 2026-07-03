import { describe, expect, it } from "vitest";

import { analyzeProductImportPriceColumns } from "../price-column-sanity";

describe("analyzeProductImportPriceColumns", () => {
  it("does not block a small import that intentionally sells below HPP", () => {
    const analysis = analyzeProductImportPriceColumns(
      Array.from({ length: 9 }, () => ({ price: 100, costPrice: 150 })),
    );

    expect(analysis).toEqual({
      comparableRowCount: 9,
      priceBelowCostRowCount: 9,
      suspectedSwapped: false,
    });
  });

  it("does not block a large import with only isolated prices below HPP", () => {
    const analysis = analyzeProductImportPriceColumns(
      Array.from({ length: 100 }, (_, index) => ({
        price: index < 12 ? 100 : 200,
        costPrice: 150,
      })),
    );

    expect(analysis).toEqual({
      comparableRowCount: 100,
      priceBelowCostRowCount: 12,
      suspectedSwapped: false,
    });
  });

  it("ignores empty and zero HPP values when calculating the ratio", () => {
    const analysis = analyzeProductImportPriceColumns([
      ...Array.from({ length: 8 }, () => ({ price: 100, costPrice: 150 })),
      { price: 100, costPrice: null },
      { price: 100, costPrice: 0 },
    ]);

    expect(analysis).toEqual({
      comparableRowCount: 8,
      priceBelowCostRowCount: 8,
      suspectedSwapped: false,
    });
  });
});
