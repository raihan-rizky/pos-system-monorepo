import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindFirstMock = vi.hoisted(() => vi.fn());
const brandFindFirstMock = vi.hoisted(() => vi.fn());
const productUpdateMock = vi.hoisted(() => vi.fn());
const productPriceLogCreateManyMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    product: {
      findFirst: productFindFirstMock,
      update: productUpdateMock,
    },
    brand: {
      findFirst: brandFindFirstMock,
    },
    productPriceLog: {
      createMany: productPriceLogCreateManyMock,
    },
    $transaction: transactionMock,
  },
  Prisma: {},
}));

describe("PUT /api/products/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Admin User",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    brandFindFirstMock.mockResolvedValue({ id: "brand-joyko" });
    productFindFirstMock.mockResolvedValue({
      id: "product-1",
      price: "15000.00",
      costPrice: "9000.00",
    });
    productUpdateMock.mockResolvedValue({
      id: "product-1",
      name: "Banner Flexi",
      sku: "BNR-FLX",
      price: "17000.00",
      costPrice: "10000.00",
      category: { id: "cat-1", name: "Jasa Cetak", icon: null, color: null },
    });
    productPriceLogCreateManyMock.mockResolvedValue({ count: 2 });
    transactionMock.mockImplementation((callback) =>
      callback({
        product: {
          update: productUpdateMock,
        },
        productPriceLog: {
          createMany: productPriceLogCreateManyMock,
        },
      }),
    );
  });

  it("writes price and HPP change logs with the manual note", async () => {
    const response = await PUT(
      new Request("http://localhost/api/products/product-1", {
        method: "PUT",
        body: JSON.stringify({
          price: 17000,
          costPrice: 10000,
          priceChangeNote: "Harga supplier naik",
        }),
      }),
      { params: Promise.resolve({ id: "product-1" }) },
    );

    expect(response.status).toBe(200);
    expect(productPriceLogCreateManyMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          productId: "product-1",
          storeId: "store-main",
          field: "PRICE",
          oldValue: "15000.00",
          newValue: "17000.00",
          source: "MANUAL",
          note: "Harga supplier naik",
          changedBy: "user-1",
          changedByName: "Admin User",
        }),
        expect.objectContaining({
          productId: "product-1",
          storeId: "store-main",
          field: "COST_PRICE",
          oldValue: "9000.00",
          newValue: "10000.00",
          source: "MANUAL",
          note: "Harga supplier naik",
        }),
      ],
    });
  });

  it("rejects brand assignment from another store when updating a product", async () => {
    brandFindFirstMock.mockResolvedValue(null);

    const response = await PUT(
      new Request("http://localhost/api/products/product-1", {
        method: "PUT",
        body: JSON.stringify({
          brandId: "brand-other-store",
        }),
      }),
      { params: Promise.resolve({ id: "product-1" }) },
    );

    expect(response.status).toBe(404);
    expect(brandFindFirstMock).toHaveBeenCalledWith({
      where: { id: "brand-other-store", storeId: "store-main" },
      select: { id: true },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
