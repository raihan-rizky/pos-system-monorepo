import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productStockGroupFindFirstMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const productStockGroupUpdateMock = vi.hoisted(() => vi.fn());
const productUpdateMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
    productStockGroup: {
      findFirst: productStockGroupFindFirstMock,
    },
  },
}));

describe("GET /api/product-stock-groups/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
  });

  it("returns variants with calculated display stock and review flags", async () => {
    productStockGroupFindFirstMock.mockResolvedValue({
      id: "group-1",
      storeId: "store-main",
      groupKey: "paper|cat|70gsm|a4",
      displayName: "Kertas A4",
      baseUnit: "lembar",
      baseStock: 1000,
      products: [
        {
          id: "rim-1",
          name: "Kertas A4",
          sku: "A4-RIM",
          unit: "rim",
          unitMultiplierToBase: 500,
          conversionNeedsReview: false,
          stock: 0,
          price: 55000,
          costPrice: 45000,
          minStock: 2,
          size: "A4",
          material: "70gsm",
          category: { id: "cat", name: "Kertas", icon: null, color: null },
        },
      ],
    });

    const { GET } = await import("../route");
    const response = await GET(
      new Request("http://localhost/api/product-stock-groups/group-1"),
      { params: Promise.resolve({ id: "group-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.baseStock).toBe(1000);
    expect(body.variants[0]).toEqual(
      expect.objectContaining({
        id: "rim-1",
        stock: 2,
        unit: "rim",
        unitMultiplierToBase: 500,
        conversionNeedsReview: false,
      }),
    );
    expect(body.conversionPairs).toEqual([]);
  });
});

describe("POST /api/product-stock-groups/[id]/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    productStockGroupFindFirstMock.mockResolvedValue({
      id: "group-1",
      storeId: "store-main",
      displayName: "Kertas A4",
      baseUnit: "lembar",
      baseStock: 1000,
      products: [],
    });
    productFindManyMock.mockResolvedValue([
      { id: "rim", unit: "rim", stock: 4, unitMultiplierToBase: 500 },
      { id: "pack", unit: "pack", stock: 20, unitMultiplierToBase: 100 },
    ]);
    productStockGroupUpdateMock.mockResolvedValue({ id: "group-1", baseStock: 2000 });
    productUpdateMock.mockResolvedValue({});
    inventoryLogCreateManyMock.mockResolvedValue({ count: 2 });
    dbTransactionMock.mockImplementation((callback) =>
      callback({
        productStockGroup: {
          findFirst: productStockGroupFindFirstMock,
          update: productStockGroupUpdateMock,
        },
        product: { findMany: productFindManyMock, update: productUpdateMock },
        inventoryLog: { createMany: inventoryLogCreateManyMock },
      }),
    );
  });

  it("moves products into an existing group and keeps old groups untouched", async () => {
    const { POST } = await import("../products/route");
    const response = await POST(
      new Request("http://localhost/api/product-stock-groups/group-1/products", {
        method: "POST",
        body: JSON.stringify({
          sharedStock: 2000,
          stockInput: { mode: "BASE" },
          products: [
            { productId: "rim", unitMultiplierToBase: 500 },
            { productId: "pack", unitMultiplierToBase: 100 },
          ],
          note: "Move into group",
        }),
      }),
      { params: Promise.resolve({ id: "group-1" }) },
    );

    expect(response.status).toBe(200);
    expect(productStockGroupUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "group-1" },
        data: expect.objectContaining({ baseStock: 2000 }),
      }),
    );
    expect(productUpdateMock).toHaveBeenCalledWith({
      where: { id: "rim" },
      data: {
        stockGroupId: "group-1",
        unitMultiplierToBase: 500,
        conversionNeedsReview: false,
      },
    });
  });

  it("rejects products with units already present in the target group", async () => {
    productStockGroupFindFirstMock.mockResolvedValueOnce({
      id: "group-1",
      storeId: "store-main",
      displayName: "Kertas A4",
      baseUnit: "rim",
      baseStock: 4,
      products: [{ id: "existing-rim", unit: "rim", stock: 4, unitMultiplierToBase: 1 }],
    });
    productFindManyMock.mockResolvedValueOnce([
      { id: "new-rim", unit: "rim", stock: 2 },
      { id: "dus", unit: "dus", stock: 1 },
    ]);

    const { POST } = await import("../products/route");
    const response = await POST(
      new Request("http://localhost/api/product-stock-groups/group-1/products", {
        method: "POST",
        body: JSON.stringify({
          sourceProductId: "existing-rim",
          products: [{ productId: "new-rim" }, { productId: "dus" }],
          conversionPairs: [
            {
              fromProductId: "dus",
              fromQuantity: 1,
              toProductId: "existing-rim",
              toQuantity: 5,
            },
            {
              fromProductId: "new-rim",
              fromQuantity: 1,
              toProductId: "existing-rim",
              toQuantity: 1,
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "group-1" }) },
    );

    expect(response.status).toBe(422);
  });
});

describe("PATCH /api/product-stock-groups/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    productStockGroupFindFirstMock.mockResolvedValue({
      id: "group-1",
      storeId: "store-main",
      displayName: "Kertas A4",
      baseUnit: "lembar",
      baseStock: 1000,
      products: [
        { id: "rim", unitMultiplierToBase: 500 },
        { id: "pack", unitMultiplierToBase: 100 },
      ],
    });
    productStockGroupUpdateMock.mockResolvedValue({ id: "group-1", baseStock: 1500 });
    inventoryLogCreateManyMock.mockResolvedValue({ count: 2 });
    dbTransactionMock.mockImplementation((callback) =>
      callback({
        productStockGroup: {
          findFirst: productStockGroupFindFirstMock,
          update: productStockGroupUpdateMock,
        },
        inventoryLog: { createMany: inventoryLogCreateManyMock },
      }),
    );
  });

  it("updates shared stock from a variant unit and writes one log per variant", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(
      new Request("http://localhost/api/product-stock-groups/group-1", {
        method: "PATCH",
        body: JSON.stringify({
          sharedStock: 3,
          stockInput: { mode: "VARIANT", variantProductId: "rim" },
          note: "Manual shared update",
        }),
      }),
      { params: Promise.resolve({ id: "group-1" }) },
    );

    expect(response.status).toBe(200);
    expect(productStockGroupUpdateMock).toHaveBeenCalledWith({
      where: { id: "group-1" },
      data: { baseStock: 1500 },
    });
    expect(inventoryLogCreateManyMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ productId: "rim", quantity: 1 }),
        expect.objectContaining({ productId: "pack", quantity: 5 }),
      ],
    });
  });
});
