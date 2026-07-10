import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindFirstMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const brandFindFirstMock = vi.hoisted(() => vi.fn());
const categoryFindFirstMock = vi.hoisted(() => vi.fn());
const productUpdateMock = vi.hoisted(() => vi.fn());
const productUpdateManyMock = vi.hoisted(() => vi.fn());
const productStockGroupFindFirstMock = vi.hoisted(() => vi.fn());
const productStockGroupUpdateMock = vi.hoisted(() => vi.fn());
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
      findMany: productFindManyMock,
      update: productUpdateMock,
      updateMany: productUpdateManyMock,
    },
    category: {
      findFirst: categoryFindFirstMock,
    },
    brand: {
      findFirst: brandFindFirstMock,
    },
    productStockGroup: {
      findFirst: productStockGroupFindFirstMock,
      update: productStockGroupUpdateMock,
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
    categoryFindFirstMock.mockResolvedValue({ id: "cat-1", name: "Jasa Cetak" });
    productFindManyMock.mockResolvedValue([]);
    productUpdateManyMock.mockResolvedValue({ count: 0 });
    productStockGroupFindFirstMock.mockResolvedValue(null);
    productStockGroupUpdateMock.mockResolvedValue({ id: "stock-group-1" });
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
          findMany: productFindManyMock,
          updateMany: productUpdateManyMock,
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
      select: { id: true, name: true, normalizedName: true },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("updates the selected stock group metadata atomically for every variant", async () => {
    productFindFirstMock.mockResolvedValue({
      id: "product-1",
      storeId: "store-main",
      name: "Kertas A4",
      categoryId: "cat-paper",
      brandId: null,
      stockGroupId: "stock-group-1",
      stockGroup: { id: "stock-group-1", groupKey: "kertas a4|cat-paper||" },
      material: null,
      size: null,
    });
    productFindManyMock.mockResolvedValue([
      { id: "product-1" },
      { id: "product-2" },
    ]);
    categoryFindFirstMock.mockResolvedValue({ id: "cat-office", name: "Kantor" });
    brandFindFirstMock.mockResolvedValue({ id: "brand-joyko" });
    transactionMock.mockImplementation((callback) =>
      callback({
        product: {
          findMany: productFindManyMock,
          updateMany: productUpdateManyMock,
        },
        productStockGroup: {
          findFirst: productStockGroupFindFirstMock,
          update: productStockGroupUpdateMock,
        },
      }),
    );

    const response = await PUT(
      new Request("http://localhost/api/products/product-1", {
        method: "PUT",
        body: JSON.stringify({
          quickEditGroup: true,
          name: "Kertas Premium",
          categoryId: "cat-office",
          brandId: "brand-joyko",
        }),
      }),
      { params: Promise.resolve({ id: "product-1" }) },
    );

    expect(response.status).toBe(200);
    expect(productUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: { in: ["product-1", "product-2"] },
        storeId: "store-main",
      },
      data: {
        name: "Kertas Premium",
        categoryId: "cat-office",
        brandId: "brand-joyko",
      },
    });
    await expect(response.json()).resolves.toMatchObject({
      productIds: ["product-1", "product-2"],
      name: "Kertas Premium",
      category: { id: "cat-office", name: "Kantor" },
      brand: { id: "brand-joyko" },
    });
  });
});
