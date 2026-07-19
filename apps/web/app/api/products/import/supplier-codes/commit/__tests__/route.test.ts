import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const supplierFindManyMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const deleteManyMock = vi.hoisted(() => vi.fn());
const createManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    product: { findMany: productFindManyMock },
    supplier: { findMany: supplierFindManyMock },
    $transaction: transactionMock,
  },
}));

describe("POST /api/products/import/supplier-codes/commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({ id: "user-1", storeId: "store-main" });
    productFindManyMock.mockResolvedValue([{ id: "product-1", sku: "ATK-001" }]);
    supplierFindManyMock.mockResolvedValue([{ id: "supplier-1", code: "SP0001" }]);
    transactionMock.mockImplementation(async (callback) =>
      callback({
        productSupplier: {
          deleteMany: deleteManyMock,
          createMany: createManyMock,
        },
      }),
    );
  });

  it("mengganti relasi supplier setelah memvalidasi ulang referensi", async () => {
    const response = await POST(
      new Request("http://localhost/api/products/import/supplier-codes/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: [
            {
              rowNumber: 2,
              sku: "ATK-001",
              productId: "product-1",
              supplierCodes: ["SP0001"],
              supplierIds: ["supplier-1"],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { productId: "product-1" } });
    expect(createManyMock).toHaveBeenCalledWith({
      data: [{ productId: "product-1", supplierId: "supplier-1" }],
      skipDuplicates: true,
    });
    await expect(response.json()).resolves.toEqual({
      updatedProducts: 1,
      linkedSuppliers: 1,
    });
  });

  it("menolak referensi produk yang tidak lagi valid", async () => {
    productFindManyMock.mockResolvedValue([]);
    const response = await POST(
      new Request("http://localhost/api/products/import/supplier-codes/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: [
            {
              rowNumber: 2,
              sku: "ATK-001",
              productId: "product-1",
              supplierCodes: ["SP0001"],
              supplierIds: ["supplier-1"],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
