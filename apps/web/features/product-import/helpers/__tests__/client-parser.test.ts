import { describe, expect, it } from "vitest";

import { buildAutoMapping, getMissingRequiredColumns } from "../client-parser";

describe("client product import column mapping", () => {
  it("maps legacy catalog headers into POS import columns", () => {
    const mapping = buildAutoMapping([
      "Kode Item",
      "Nama Item",
      "Kategori",
      "Satuan",
      "Konversi",
      "Harga Pokok",
      "Harga Level 1",
      "Harga Level 2",
    ]);

    expect(mapping).toEqual({
      "Kode Item": "sku",
      "Nama Item": "name",
      Kategori: "category",
      Satuan: "unit",
      Konversi: "unitMultiplierToBase",
      "Harga Pokok": "costPrice",
      "Harga Level 1": "price",
      "Harga Level 2": "hargaDinas",
    });
    expect(getMissingRequiredColumns(mapping)).toEqual([]);
  });
});
