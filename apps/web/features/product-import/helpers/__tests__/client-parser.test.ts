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
      "Harga Agen",
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
      "Harga Agen": "hargaAgen",
    });
    expect(getMissingRequiredColumns(mapping)).toEqual([]);
  });

  it("keeps duplicate source headers addressable with stable mapping keys", () => {
    const mapping = buildAutoMapping([
      "Kode Item",
      "Nama Item",
      "Jenis",
      "Stok",
      "Satuan",
      "Qty / Paket",
      "Satuan",
      "Harga Pokok",
      "Harga Level 1",
    ]);

    expect(mapping).toEqual({
      "Kode Item": "sku",
      "Nama Item": "name",
      Jenis: "",
      Stok: "stock",
      Satuan: "unit",
      "Qty / Paket": "",
      Satuan__2: "",
      "Harga Pokok": "costPrice",
      "Harga Level 1": "price",
    });
  });
});
