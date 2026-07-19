import { describe, expect, it } from "vitest";

import {
  buildSupplierCodeImportRecords,
  normalizeSupplierCodeImportRows,
} from "../import-core";

describe("impor kode supplier massal", () => {
  it("mengenali variasi header SKU dan kode supplier", () => {
    expect(
      buildSupplierCodeImportRecords([
        ["Kode Produk", "Kode Supplier"],
        [" atk-001 ", " sp0001, SP0002 "],
      ]),
    ).toEqual({
      headers: ["sku", "supplierCode"],
      records: [{ sku: " atk-001 ", supplierCode: " sp0001, SP0002 " }],
    });
  });

  it("memvalidasi SKU dan kode supplier serta menghapus duplikat kode", () => {
    const result = normalizeSupplierCodeImportRows(
      [{ sku: " atk-001 ", supplierCode: " sp0001, SP0001, sp0002 " }],
      new Map([["ATK-001", { id: "product-1", name: "Pulpen" }]]),
      new Map([["SP0001", { id: "supplier-1", name: "PT Satu" }]]),
    );

    expect(result.rows).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        sku: "ATK-001",
        productId: "product-1",
        productName: "Pulpen",
        supplierCodes: ["SP0001", "SP0002"],
        supplierIds: ["supplier-1"],
        errors: ["Kode supplier SP0002 tidak ditemukan."],
      }),
    ]);
    expect(result.validRows).toBe(0);
  });

  it("menolak SKU yang tidak ditemukan dan baris tanpa kode supplier", () => {
    const result = normalizeSupplierCodeImportRows(
      [
        { sku: "MISSING", supplierCode: "SP0001" },
        { sku: "ATK-001", supplierCode: "" },
      ],
      new Map([["ATK-001", { id: "product-1", name: "Pulpen" }]]),
      new Map([["SP0001", { id: "supplier-1", name: "PT Satu" }]]),
    );

    expect(result.rows[0].errors).toContain("Produk dengan SKU MISSING tidak ditemukan.");
    expect(result.rows[1].errors).toContain("Kode supplier wajib diisi.");
  });

  it("menandai SKU ganda di dalam berkas", () => {
    const products = new Map([["ATK-001", { id: "product-1", name: "Pulpen" }]]);
    const suppliers = new Map([["SP0001", { id: "supplier-1", name: "PT Satu" }]]);
    const result = normalizeSupplierCodeImportRows(
      [
        { sku: "ATK-001", supplierCode: "SP0001" },
        { sku: "atk-001", supplierCode: "SP0001" },
      ],
      products,
      suppliers,
    );

    expect(result.rows[1].errors).toContain("SKU ATK-001 muncul lebih dari sekali di dalam berkas.");
  });
});
