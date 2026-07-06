import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindUniqueMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const productCountMock = vi.hoisted(() => vi.fn());
const productStockGroupFindManyMock = vi.hoisted(() => vi.fn());
const brandFindFirstMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const productCreateMock = vi.hoisted(() => vi.fn());
const productUpdateMock = vi.hoisted(() => vi.fn());
const productDeleteMock = vi.hoisted(() => vi.fn());
const transactionItemCountMock = vi.hoisted(() => vi.fn());
const productPriceLogCreateManyMock = vi.hoisted(() => vi.fn());
const txProductStockGroupFindUniqueMock = vi.hoisted(() => vi.fn());
const txProductStockGroupCreateMock = vi.hoisted(() => vi.fn());
const groupActivityCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    product: {
      findUnique: productFindUniqueMock,
      findMany: productFindManyMock,
      count: productCountMock,
      create: productCreateMock,
      update: productUpdateMock,
      delete: productDeleteMock,
    },
    productStockGroup: {
      findMany: productStockGroupFindManyMock,
    },
    brand: {
      findFirst: brandFindFirstMock,
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
    brandFindFirstMock.mockResolvedValue(null);
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

  it("creates packaging and smallest sellable unit variants in one stock group", async () => {
    productFindUniqueMock.mockResolvedValue(null);
    txProductStockGroupFindUniqueMock.mockResolvedValue(null);
    txProductStockGroupCreateMock.mockResolvedValue({
      id: "group-1",
      storeId: "store-main",
      groupKey: "acco plastik joyko|cat-1||",
      displayName: "Acco Plastik Joyko",
      baseUnit: "pcs",
      baseStock: 48,
    });
    productCreateMock
      .mockResolvedValueOnce({
        id: "product-dus",
        name: "Acco Plastik Joyko",
        sku: "ACCO-DUS",
        price: 50000,
        costPrice: 35000,
        stock: 0.96,
        unit: "Dus",
        unitMultiplierToBase: 50,
        category: { id: "cat-1", name: "ATK", icon: null, color: null },
        stockGroup: {
          id: "group-1",
          groupKey: "acco plastik joyko|cat-1||",
          displayName: "Acco Plastik Joyko",
          baseUnit: "pcs",
          baseStock: 48,
        },
      })
      .mockResolvedValueOnce({
        id: "product-pcs",
        name: "Acco Plastik Joyko",
        sku: "ACCO-PCS",
        price: 1200,
        costPrice: 700,
        stock: 48,
        unit: "pcs",
        unitMultiplierToBase: 1,
      });
    transactionMock.mockImplementation((callback) =>
      callback({
        product: { create: productCreateMock },
        productStockGroup: {
          findUnique: txProductStockGroupFindUniqueMock,
          create: txProductStockGroupCreateMock,
        },
        productPriceLog: { createMany: productPriceLogCreateManyMock },
        productStockGroupActivity: { create: groupActivityCreateMock },
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/products", {
        method: "POST",
        body: JSON.stringify({
          name: "Acco Plastik Joyko",
          sku: "ACCO-DUS",
          categoryId: "cat-1",
          price: 50000,
          costPrice: 35000,
          stock: 0.96,
          unit: "Dus",
          unitMultiplierToBase: 50,
          smallestUnitVariant: {
            unit: "pcs",
            sku: "ACCO-PCS",
            price: 1200,
            costPrice: 700,
            multiplierFromPackaging: 50,
          },
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(txProductStockGroupCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          baseUnit: "pcs",
          baseStock: 48,
        }),
      }),
    );
    expect(productCreateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          sku: "ACCO-DUS",
          unit: "Dus",
          unitMultiplierToBase: 50,
          stockGroupId: "group-1",
        }),
      }),
    );
    expect(productCreateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          sku: "ACCO-PCS",
          unit: "pcs",
          stock: 48,
          unitMultiplierToBase: 1,
          stockGroupId: "group-1",
        }),
      }),
    );
  });

  it("persists optional brand assignment when creating a product", async () => {
    brandFindFirstMock.mockResolvedValue({ id: "brand-joyko" });
    productCreateMock.mockResolvedValue({
      id: "product-1",
      name: "Pulpen Joyko",
      sku: "JOYKO-PEN",
      price: 5000,
      costPrice: 3000,
      brandId: "brand-joyko",
      storeId: "store-main",
      category: { id: "cat-1", name: "ATK", icon: null, color: null },
      brand: { id: "brand-joyko", name: "Joyko", normalizedName: "joyko" },
    });

    const response = await POST(
      new Request("http://localhost/api/products", {
        method: "POST",
        body: JSON.stringify({
          name: "Pulpen Joyko",
          sku: "JOYKO-PEN",
          categoryId: "cat-1",
          brandId: "brand-joyko",
          price: 5000,
          costPrice: 3000,
          stock: 10,
          unit: "pcs",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(productCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brandId: "brand-joyko",
        }),
      }),
    );
  });

  it("rejects brand assignment from another store when creating a product", async () => {
    brandFindFirstMock.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/products", {
        method: "POST",
        body: JSON.stringify({
          name: "Pulpen Joyko",
          sku: "JOYKO-PEN",
          categoryId: "cat-1",
          brandId: "brand-other-store",
          price: 5000,
          stock: 10,
          unit: "pcs",
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(brandFindFirstMock).toHaveBeenCalledWith({
      where: { id: "brand-other-store", storeId: "store-main" },
      select: { id: true },
    });
    expect(productCreateMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Owner User",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    productStockGroupFindManyMock.mockResolvedValue([
      { id: "group-1", _count: { products: 2 } },
    ]);
    productFindManyMock.mockResolvedValue([
      {
        id: "product-1",
        name: "Kertas A4",
        sku: "A4-RIM",
        price: 50000,
        costPrice: null,
        stock: 2,
        minStock: 1,
        unit: "rim",
        size: "A4",
        material: "70gsm",
        category: { id: "cat-1", name: "Kertas", icon: null, color: null },
        stockGroup: {
          id: "group-1",
          groupKey: "kertas|cat|70gsm|a4",
          displayName: "Kertas A4",
          baseUnit: "lembar",
          baseStock: 1000,
        },
        unitMultiplierToBase: 500,
      },
    ]);
    productCountMock.mockResolvedValue(1);
  });

  it("filters products to groups with at least the requested variant count", async () => {
    const response = await GET(
      new Request("http://localhost/api/products?stockGroupMinVariants=2"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(productStockGroupFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "store-main" }),
      }),
    );
    expect(productFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stockGroupId: { in: ["group-1"] },
        }),
      }),
    );
    expect(body.data[0].stock).toBe(2);
  });

  it("groups products by name and category", async () => {
    productFindManyMock.mockResolvedValue([
      {
        id: "p1",
        name: "Coffee",
        sku: "COFFEE-DUS",
        price: 50000,
        stock: 10,
        unit: "dus",
        isActive: true,
        category: { id: "cat1", name: "Beverage", icon: null, color: "#000" },
      },
      {
        id: "p2",
        name: "Coffee",
        sku: "COFFEE-PCS",
        price: 5000,
        stock: 100,
        unit: "pcs",
        isActive: true,
        category: { id: "cat1", name: "Beverage", icon: null, color: "#000" },
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/products"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].variants).toHaveLength(2);
    expect(body.data[0].defaultVariant.stock).toBe(100);
  });

  it("searches products by category and brand names", async () => {
    productFindManyMock.mockResolvedValue([
      {
        id: "p-kertas-a4",
        name: "A4 70gsm",
        sku: "A4-70-RIM",
        price: 50000,
        stock: 10,
        unit: "rim",
        isActive: true,
        category: { id: "cat-paper", name: "Kertas", icon: null, color: "#000" },
        brand: { id: "brand-paperline", name: "Paperline", normalizedName: "paperline" },
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/products?search=kertas"),
    );

    expect(response.status).toBe(200);
    expect(productFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            expect.objectContaining({
              OR: expect.arrayContaining([
                {
                  category: {
                    is: {
                      name: { contains: "kertas", mode: "insensitive" },
                    },
                  },
                },
                {
                  brand: {
                    is: {
                      name: { contains: "kertas", mode: "insensitive" },
                    },
                  },
                },
              ]),
            }),
          ],
        }),
      }),
    );
  });
});

describe("DELETE /api/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Owner User",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    productUpdateMock.mockResolvedValue({ id: "product-1" });
    productDeleteMock.mockResolvedValue({ id: "product-1" });
  });

  it("hard-deletes products with no transactions and soft-deletes products with transactions", async () => {
    productFindManyMock.mockResolvedValue([{ id: "product-1" }, { id: "product-2" }]);
    // product-1 never sold -> hard delete; product-2 sold -> soft delete
    transactionItemCountMock
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);

    const response = await DELETE(
      new Request("http://localhost/api/products?ids=product-1,product-2", {
        method: "DELETE",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(productDeleteMock).toHaveBeenCalledWith({ where: { id: "product-1" } });
    expect(productUpdateMock).toHaveBeenCalledWith({
      where: { id: "product-2" },
      data: { isActive: false },
    });
    expect(body.summary).toEqual({
      total: 2,
      hardDeleted: 1,
      softDeleted: 1,
      failed: 0,
    });
    expect(body.results).toEqual([
      { id: "product-1", status: "hard_deleted" },
      { id: "product-2", status: "soft_deleted" },
    ]);
  });

  it("rejects when no ids provided", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/products", { method: "DELETE" }),
    );
    expect(response.status).toBe(422);
  });

  it("rejects when some products do not belong to the store", async () => {
    productFindManyMock.mockResolvedValue([{ id: "product-1" }]);

    const response = await DELETE(
      new Request("http://localhost/api/products?ids=product-1,product-2", {
        method: "DELETE",
      }),
    );
    expect(response.status).toBe(404);
    expect(productDeleteMock).not.toHaveBeenCalled();
  });

  it("reports partial failures with 207 status (fail-soft)", async () => {
    productFindManyMock.mockResolvedValue([{ id: "product-1" }, { id: "product-2" }]);
    transactionItemCountMock.mockResolvedValue(0);
    productDeleteMock
      .mockResolvedValueOnce({ id: "product-1" })
      .mockRejectedValueOnce(new Error("FK constraint"));

    const response = await DELETE(
      new Request("http://localhost/api/products?ids=product-1,product-2", {
        method: "DELETE",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(body.summary.failed).toBe(1);
    expect(body.summary.hardDeleted).toBe(1);
    expect(body.results).toEqual([
      { id: "product-1", status: "hard_deleted" },
      { id: "product-2", status: "error", message: "FK constraint" },
    ]);
  });
});
