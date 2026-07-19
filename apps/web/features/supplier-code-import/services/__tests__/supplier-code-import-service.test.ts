import { describe, expect, it, vi } from "vitest";

import { commitSupplierCodeImport } from "../supplier-code-import-service";

describe("commitSupplierCodeImport", () => {
  it("mengganti relasi supplier untuk setiap produk dalam satu transaksi", async () => {
    const replaceAssignments = vi.fn().mockResolvedValue(undefined);

    const result = await commitSupplierCodeImport(
      { replaceAssignments },
      [
        {
          rowNumber: 2,
          sku: "ATK-001",
          productId: "product-1",
          supplierCodes: ["SP0001", "SP0002"],
          supplierIds: ["supplier-1", "supplier-2"],
        },
      ],
    );

    expect(replaceAssignments).toHaveBeenCalledWith([
      {
        productId: "product-1",
        supplierIds: ["supplier-1", "supplier-2"],
      },
    ]);
    expect(result).toEqual({ updatedProducts: 1, linkedSuppliers: 2 });
  });

  it("menolak payload dengan produk atau supplier duplikat", async () => {
    const replaceAssignments = vi.fn();

    await expect(
      commitSupplierCodeImport(
        { replaceAssignments },
        [
          {
            rowNumber: 2,
            sku: "ATK-001",
            productId: "product-1",
            supplierCodes: ["SP0001", "SP0001"],
            supplierIds: ["supplier-1", "supplier-1"],
          },
        ],
      ),
    ).rejects.toThrow("Data impor kode supplier tidak valid.");
    expect(replaceAssignments).not.toHaveBeenCalled();
  });
});
