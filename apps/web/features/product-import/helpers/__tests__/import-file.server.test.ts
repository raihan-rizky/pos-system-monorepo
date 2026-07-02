import { describe, expect, it } from "vitest";

import { parseImportFile } from "../import-file.server";

function toArrayBuffer(input: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(input);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

describe("parseImportFile", () => {
  it("keeps row values aligned when a CSV contains an empty header column", async () => {
    const csv = [
      "No.;Kode Item;Nama Item;Jenis;Stok;Satuan;Qty / Paket;;Harga Pokok;Harga Level 1;Harga Level 2;Harga Level 3",
      "1;A-001;Acco plastik Joyko;ATK;175;Dus;1;Dus;7600;12000;13500;0",
    ].join("\n");

    const { records } = await parseImportFile(toArrayBuffer(csv), {
      "Kode Item": "sku",
      "Nama Item": "name",
      Jenis: "category",
      Stok: "stock",
      Satuan: "unit",
      "Qty / Paket": "unitMultiplierToBase",
      "Harga Pokok": "costPrice",
      "Harga Level 1": "price",
      "Harga Level 2": "hargaDinas",
      "Harga Level 3": "hargaAgen",
    });

    expect(records[0]).toEqual(
      expect.objectContaining({
        sku: "A-001",
        name: "Acco plastik Joyko",
        category: "ATK",
        stock: "175",
        unit: "Dus",
        unitMultiplierToBase: "1",
        costPrice: "7600",
        price: "12000",
        hargaDinas: "13500",
        hargaAgen: "0",
      }),
    );
  });

  it("keeps duplicate headers from overwriting earlier mapped columns", async () => {
    const csv = [
      "No.;Kode Item;Nama Item;Jenis;Stok;Satuan;Qty / Paket;Satuan;Harga Pokok;Harga Level 1;Harga Level 2;Harga Level 3",
      "2;A-001;Acco plastik Joyko;ATK;17,5;Pak;10;Dus;76000;108000;0;0",
    ].join("\n");

    const { records } = await parseImportFile(toArrayBuffer(csv), {
      "Kode Item": "sku",
      "Nama Item": "name",
      Jenis: "category",
      Stok: "stock",
      Satuan: "unit",
      "Qty / Paket": "unitMultiplierToBase",
      Satuan__2: "",
      "Harga Pokok": "costPrice",
      "Harga Level 1": "price",
      "Harga Level 2": "hargaDinas",
      "Harga Level 3": "hargaAgen",
    });

    expect(records[0]).toEqual(
      expect.objectContaining({
        sku: "A-001",
        name: "Acco plastik Joyko",
        category: "ATK",
        stock: "17,5",
        unit: "Pak",
        unitMultiplierToBase: "10",
        costPrice: "76000",
        price: "108000",
        hargaDinas: "0",
        hargaAgen: "0",
      }),
    );
  });
});
