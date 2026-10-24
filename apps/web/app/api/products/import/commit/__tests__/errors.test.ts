import { describe, expect, it } from "vitest";

import { productImportCommitErrorResponse } from "../errors";
import { GroupPricingError } from "@/features/product-stock-groups/group-pricing-service";

describe("productImportCommitErrorResponse", () => {
  it("returns actionable group pricing conflicts to import callers", async () => {
    const response = productImportCommitErrorResponse(new GroupPricingError("HPP Otomatis mengikuti acuan; pilih Manual.", 422));
    expect(response?.status).toBe(422);
    expect(await response?.json()).toMatchObject({ message: expect.stringContaining("Manual") });
  });
  it("returns a friendly validation response for a suspicious price/HPP inversion", async () => {
    const response = productImportCommitErrorResponse(
      new Error("PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED:8:10"),
    );

    expect(response?.status).toBe(422);
    await expect(response?.json()).resolves.toEqual({
      code: "PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED",
      message:
        "Mayoritas Harga Jual lebih rendah daripada HPP. Periksa kembali mapping kolom Harga Jual dan HPP sebelum melanjutkan import.",
      comparableRowCount: 10,
      priceBelowCostRowCount: 8,
    });
  });
});
