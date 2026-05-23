import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindUniqueMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const productCreateMock = vi.hoisted(() => vi.fn());
const productPriceLogCreateManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    product: {
      findUnique: productFindUniqueMock,
      create: productCreateMock,
    },
    productPriceLog: {
      createMany: productPriceLogCreateManyMock,
    },
    $transaction: transactionMock,
  },
  Prisma: {},
}));

describe("POST /api/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Owner User",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    productFindUniqueMock.mockResolvedValue(null);
    productCreateMock.mockResolvedValue({
      id: "product-1",
      name: "Banner Flexi",
      sku: "BNR-FLX",
      price: 15000,
      costPrice: 9000,
      storeId: "store-main",
      category: { id: "cat-1", name: "Jasa Cetak", icon: null, color: null },
    });
    productPriceLogCreateManyMock.mockResolvedValue({ count: 2 });
    transactionMock.mockImplementation((callback) =>
      callback({
        product: { create: productCreateMock },
        productPriceLog: { createMany: productPriceLogCreateManyMock },
      }),
    );
  });

  it("writes baseline price and HPP logs when creating a product", async () => {
    const response = await POST(
      new Request("http://localhost/api/products", {
        method: "POST",
        body: JSON.stringify({
          name: "Banner Flexi",
          sku: "BNR-FLX",
          categoryId: "cat-1",
          price: 15000,
          costPrice: 9000,
          stock: 0,
          unit: "meter",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(productPriceLogCreateManyMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          productId: "product-1",
          storeId: "store-main",
          field: "PRICE",
          oldValue: null,
          newValue: "15000.00",
          source: "MANUAL",
          changedBy: "user-1",
          changedByName: "Owner User",
        }),
        expect.objectContaining({
          productId: "product-1",
          storeId: "store-main",
          field: "COST_PRICE",
          oldValue: null,
          newValue: "9000.00",
          source: "MANUAL",
        }),
      ],
    });
  });
});
