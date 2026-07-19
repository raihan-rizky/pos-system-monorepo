import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const supplierFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    product: { findMany: productFindManyMock },
    supplier: { findMany: supplierFindManyMock },
  },
}));

describe("POST /api/products/import/supplier-codes/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({ id: "user-1", storeId: "store-main" });
    productFindManyMock.mockResolvedValue([
      { id: "product-1", sku: "ATK-001", name: "Pulpen" },
    ]);
    supplierFindManyMock.mockResolvedValue([
      { id: "supplier-1", code: "SP0001", name: "PT Satu" },
    ]);
  });

  it("mempratinjau relasi supplier berdasarkan SKU", async () => {
    const formData = new FormData();
    formData.set(
      "file",
      new File(["SKU,Kode Supplier\nATK-001,SP0001"], "supplier.csv", {
        type: "text/csv",
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/products/import/supplier-codes/preview", {
        method: "POST",
        body: formData,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({ totalRows: 1, validRows: 1, invalidRows: 0 }),
    );
    expect(body.rows[0]).toEqual(
      expect.objectContaining({
        productId: "product-1",
        productName: "Pulpen",
        supplierCodes: ["SP0001"],
        supplierIds: ["supplier-1"],
      }),
    );
  });

  it("menolak berkas tanpa kolom wajib", async () => {
    const formData = new FormData();
    formData.set("file", new File(["Nama\nPulpen"], "supplier.csv"));

    const response = await POST(
      new Request("http://localhost/api/products/import/supplier-codes/preview", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        message: "Kolom SKU dan Kode Supplier wajib tersedia.",
      }),
    );
  });
});
