import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PUT } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindFirstMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const brandFindFirstMock = vi.hoisted(() => vi.fn());
const categoryFindFirstMock = vi.hoisted(() => vi.fn());
const productUpdateMock = vi.hoisted(() => vi.fn());
const productUpdateManyMock = vi.hoisted(() => vi.fn());
const productDeleteMock = vi.hoisted(() => vi.fn());
const transactionItemCountMock = vi.hoisted(() => vi.fn());
const productStockGroupFindFirstMock = vi.hoisted(() => vi.fn());
const productStockGroupFindUniqueMock = vi.hoisted(() => vi.fn());
const productStockGroupCreateMock = vi.hoisted(() => vi.fn());
const productStockGroupUpdateMock = vi.hoisted(() => vi.fn());
const productPriceLogCreateManyMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const stockRowLockMock = vi.hoisted(() => vi.fn());

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
      delete: productDeleteMock,
    },
    category: {
      findFirst: categoryFindFirstMock,
    },
    brand: {
      findFirst: brandFindFirstMock,
    },
    productStockGroup: {
      findFirst: productStockGroupFindFirstMock,
      findUnique: productStockGroupFindUniqueMock,
      create: productStockGroupCreateMock,
      update: productStockGroupUpdateMock,
    },
    productPriceLog: {
      createMany: productPriceLogCreateManyMock,
    },
    transactionItem: {
      count: transactionItemCountMock,
    },
    $transaction: transactionMock,
  },
  Prisma: {},
}));

describe("PUT /api/products/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productFindFirstMock.mockReset();
    productStockGroupFindUniqueMock.mockReset();
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
    productStockGroupFindUniqueMock.mockResolvedValue({
      id: "stock-group-1",
      storeId: "store-main",
      groupKey: "banner flexi|cat-1||",
      displayName: "Banner Flexi",
      baseUnit: "pcs",
      baseStock: 10,
    });
    productStockGroupCreateMock.mockResolvedValue({
      id: "stock-group-new",
      storeId: "store-main",
      groupKey: "banner flexi|cat-1||",
      displayName: "Banner Flexi",
      baseUnit: "pcs",
      baseStock: 10,
    });
    productStockGroupUpdateMock.mockResolvedValue({ id: "stock-group-1" });
    stockRowLockMock.mockResolvedValue([{ id: "locked" }]);
    productFindFirstMock.mockResolvedValue({
      id: "product-1",
      storeId: "store-main",
      name: "Banner Flexi",
      sku: "BNR-FLX",
      categoryId: "cat-1",
      brandId: null,
      material: null,
      size: null,
      unit: "pcs",
      stock: 10,
      stockGroupId: null,
      stockGroup: null,
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
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
      stockGroup: {
        id: "stock-group-1",
        groupKey: "banner flexi|cat-1||",
        displayName: "Banner Flexi",
        baseUnit: "pcs",
        baseStock: 10,
      },
      unitMultiplierToBase: 1,
    });
    productPriceLogCreateManyMock.mockResolvedValue({ count: 2 });
    transactionMock.mockImplementation((callback) =>
      callback({
        $queryRaw: stockRowLockMock,
        product: {
          findFirst: productFindFirstMock,
          update: productUpdateMock,
          findMany: productFindManyMock,
          updateMany: productUpdateManyMock,
        },
        productStockGroup: {
          findUnique: productStockGroupFindUniqueMock,
          create: productStockGroupCreateMock,
          update: productStockGroupUpdateMock,
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

  it("locks sorted source and target groups before the product and reloads inside the transaction", async () => {
    const order: string[] = [];
    const existing = {
      id: "product-1",
      storeId: "store-main",
      name: "Banner Flexi",
      sku: "BNR-FLX",
      categoryId: "cat-1",
      brandId: null,
      material: null,
      size: null,
      unit: "pcs",
      stock: 0,
      stockGroupId: "group-z",
      stockGroup: { id: "group-z", baseStock: 10 },
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
      price: "15000.00",
      costPrice: "9000.00",
      hargaAgen: null,
      hargaDinas: null,
    };
    productFindFirstMock
      .mockResolvedValueOnce(existing)
      .mockImplementationOnce(async () => {
        order.push("reload-product");
        return existing;
      });
    productStockGroupFindUniqueMock
      .mockImplementationOnce(async () => {
        order.push("target-hint");
        return {
          id: "group-a",
          storeId: "store-main",
          groupKey: "banner flexi|cat-1||",
          displayName: "Banner Flexi",
          baseUnit: "pcs",
          baseStock: 20,
        };
      })
      .mockImplementationOnce(async () => {
        order.push("reload-target");
        return {
          id: "group-a",
          storeId: "store-main",
          groupKey: "banner flexi|cat-1||",
          displayName: "Banner Flexi",
          baseUnit: "pcs",
          baseStock: 20,
        };
      });
    stockRowLockMock.mockImplementation(
      async (strings: TemplateStringsArray, rowId: string) => {
        order.push(
          `${strings.join(" ").includes("pos_product_stock_groups") ? "group" : "product"}:${rowId}`,
        );
        return [{ id: rowId }];
      },
    );

    const response = await PUT(
      new Request("http://localhost/api/products/product-1", {
        method: "PUT",
        body: JSON.stringify({ price: 17000 }),
      }),
      { params: Promise.resolve({ id: "product-1" }) },
    );

    expect(response.status).toBe(200);
    expect(order).toEqual([
      "target-hint",
      "group:group-a",
      "group:group-z",
      "product:product-1",
      "reload-product",
      "reload-target",
    ]);
  });

  it("returns conflict when product membership changed before the post-lock reload", async () => {
    const hint = {
      id: "product-1",
      storeId: "store-main",
      name: "Banner Flexi",
      sku: "BNR-FLX",
      categoryId: "cat-1",
      brandId: null,
      material: null,
      size: null,
      unit: "pcs",
      stock: 0,
      stockGroupId: "group-a",
      stockGroup: { id: "group-a", baseStock: 10 },
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
      price: "15000.00",
      costPrice: "9000.00",
      hargaAgen: null,
      hargaDinas: null,
    };
    productFindFirstMock
      .mockResolvedValueOnce(hint)
      .mockResolvedValueOnce({
        ...hint,
        stockGroupId: "group-b",
        stockGroup: { id: "group-b", baseStock: 10 },
      });
    productStockGroupFindUniqueMock.mockResolvedValue({
      id: "group-a",
      storeId: "store-main",
      groupKey: "banner flexi|cat-1||",
      displayName: "Banner Flexi",
      baseUnit: "pcs",
      baseStock: 10,
    });

    const response = await PUT(
      new Request("http://localhost/api/products/product-1", {
        method: "PUT",
        body: JSON.stringify({ price: 17000 }),
      }),
      { params: Promise.resolve({ id: "product-1" }) },
    );

    expect(response.status).toBe(409);
    expect(productUpdateMock).not.toHaveBeenCalled();
    expect(productStockGroupUpdateMock).not.toHaveBeenCalled();
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
      { id: "product-1", stockGroupId: "stock-group-1" },
      { id: "product-2", stockGroupId: "stock-group-1" },
    ]);
    categoryFindFirstMock.mockResolvedValue({ id: "cat-office", name: "Kantor" });
    brandFindFirstMock.mockResolvedValue({ id: "brand-joyko" });
    transactionMock.mockImplementation((callback) =>
      callback({
        $queryRaw: stockRowLockMock,
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

describe("DELETE /api/products/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productFindFirstMock.mockReset();
    productUpdateMock.mockReset();
    productDeleteMock.mockReset();
    transactionItemCountMock.mockReset();
    stockRowLockMock.mockReset();
    transactionMock.mockReset();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Admin User",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    stockRowLockMock.mockImplementation(
      async (_strings: TemplateStringsArray, rowId: string) => [{ id: rowId }],
    );
    productUpdateMock.mockResolvedValue({ id: "product-1", isActive: false });
    productDeleteMock.mockResolvedValue({ id: "product-1" });
    transactionMock.mockImplementation((callback) =>
      callback({
        $queryRaw: stockRowLockMock,
        product: {
          findFirst: productFindFirstMock,
          update: productUpdateMock,
          delete: productDeleteMock,
        },
        transactionItem: {
          count: transactionItemCountMock,
        },
      }),
    );
  });

  it("locks the group then product and reloads before a grouped soft delete", async () => {
    const order: string[] = [];
    const groupedProduct = {
      id: "product-1",
      stockGroupId: "group-z",
      isActive: true,
    };
    productFindFirstMock
      .mockImplementationOnce(async () => {
        order.push("hint-product");
        return groupedProduct;
      })
      .mockImplementationOnce(async () => {
        order.push("reload-product");
        return groupedProduct;
      });
    stockRowLockMock.mockImplementation(
      async (strings: TemplateStringsArray, rowId: string) => {
        order.push(
          `${strings.join(" ").includes("pos_product_stock_groups") ? "group" : "product"}:${rowId}`,
        );
        return [{ id: rowId }];
      },
    );
    transactionItemCountMock.mockImplementation(async () => {
      order.push("count-transactions");
      return 2;
    });
    productUpdateMock.mockImplementation(async () => {
      order.push("soft-delete");
      return { id: "product-1", isActive: false };
    });

    const response = await DELETE(
      new Request("http://localhost/api/products/product-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "product-1" }) },
    );

    expect(response.status).toBe(204);
    expect(order).toEqual([
      "hint-product",
      "group:group-z",
      "product:product-1",
      "reload-product",
      "count-transactions",
      "soft-delete",
    ]);
    expect(productUpdateMock).toHaveBeenCalledWith({
      where: { id: "product-1" },
      data: { isActive: false },
    });
  });

  it("locks the group then product and reloads before a grouped hard delete", async () => {
    const order: string[] = [];
    const groupedProduct = {
      id: "product-1",
      stockGroupId: "group-z",
      isActive: true,
    };
    productFindFirstMock
      .mockImplementationOnce(async () => {
        order.push("hint-product");
        return groupedProduct;
      })
      .mockImplementationOnce(async () => {
        order.push("reload-product");
        return groupedProduct;
      });
    stockRowLockMock.mockImplementation(
      async (strings: TemplateStringsArray, rowId: string) => {
        order.push(
          `${strings.join(" ").includes("pos_product_stock_groups") ? "group" : "product"}:${rowId}`,
        );
        return [{ id: rowId }];
      },
    );
    transactionItemCountMock.mockImplementation(async () => {
      order.push("count-transactions");
      return 0;
    });
    productDeleteMock.mockImplementation(async () => {
      order.push("hard-delete");
      return { id: "product-1" };
    });

    const response = await DELETE(
      new Request("http://localhost/api/products/product-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "product-1" }) },
    );

    expect(response.status).toBe(204);
    expect(order).toEqual([
      "hint-product",
      "group:group-z",
      "product:product-1",
      "reload-product",
      "count-transactions",
      "hard-delete",
    ]);
    expect(productDeleteMock).toHaveBeenCalledWith({
      where: { id: "product-1" },
    });
  });
});
