import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindUniqueMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const productCountMock = vi.hoisted(() => vi.fn());
const productStockGroupFindManyMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const productCreateMock = vi.hoisted(() => vi.fn());
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
    },
    productStockGroup: {
      findMany: productStockGroupFindManyMock,
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
});
