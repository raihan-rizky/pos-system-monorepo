import { describe, expect, it } from "vitest";

import { buildProductImportResultSummary } from "../result-summary";

describe("buildProductImportResultSummary", () => {
  it("includes variant and conversion review counts when present", () => {
    expect(
      buildProductImportResultSummary({
        createdProductCount: 3,
        variantProductCount: 2,
        updatedProductCount: 1,
        skippedRowCount: 4,
        conversionReviewCount: 1,
        createdCategoryCount: 0,
        inventoryLogCount: 3,
      }),
    ).toEqual([
      { label: "Dibuat", value: 3 },
      { label: "Varian", value: 2 },
      { label: "Update Harga", value: 1 },
      { label: "Dilewati", value: 4 },
      { label: "Review Unit", value: 1 },
      { label: "Kategori", value: 0 },
      { label: "Stock Logs", value: 3 },
    ]);
  });
});
