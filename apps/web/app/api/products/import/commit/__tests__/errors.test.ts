import { describe, expect, it } from "vitest";

import { productImportCommitErrorResponse } from "../errors";

describe("productImportCommitErrorResponse", () => {
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
