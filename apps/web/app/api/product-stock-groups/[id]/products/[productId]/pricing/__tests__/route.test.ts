import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const productFindFirstMock = vi.hoisted(() => vi.fn());
const productUpdateMock = vi.hoisted(() => vi.fn());
const productPriceLogCreateManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
}));

describe("PATCH /api/product-stock-groups/[id]/products/[productId]/pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      name: "Admin",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    productFindFirstMock.mockResolvedValue({
      id: "dus",
      storeId: "store-main",
      stockGroupId: "group-1",
      price: 50000,
      costPrice: 40000,
    });
    productUpdateMock.mockResolvedValue({
      id: "dus",
      price: 45000,
      costPrice: 48000,
    });
    productPriceLogCreateManyMock.mockResolvedValue({ count: 2 });
    dbTransactionMock.mockImplementation((callback) =>
      callback({
        product: {
          findFirst: productFindFirstMock,
          update: productUpdateMock,
        },
        productPriceLog: { createMany: productPriceLogCreateManyMock },
      }),
    );
  });

  it("updates one variant price and HPP and writes product price logs", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(
      new Request(
        "http://localhost/api/product-stock-groups/group-1/products/dus/pricing",
        {
          method: "PATCH",
          body: JSON.stringify({
            price: 45000,
            costPrice: 48000,
            priceChangeNote: "Harga dus promo",
          }),
        },
      ),
      { params: Promise.resolve({ id: "group-1", productId: "dus" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.margin.warning).toBe("NEGATIVE_MARGIN");
    expect(productUpdateMock).toHaveBeenCalledWith({
      where: { id: "dus" },
      data: { price: 45000, costPrice: 48000 },
    });
    expect(productPriceLogCreateManyMock).toHaveBeenCalled();
  });
});
