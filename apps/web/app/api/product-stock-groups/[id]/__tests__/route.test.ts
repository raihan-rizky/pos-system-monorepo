import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productStockGroupFindFirstMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const groupRowLockMock = vi.hoisted(() => vi.fn());
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
    productFindManyMock.mockReset();
    productStockGroupFindFirstMock.mockReset();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    groupRowLockMock.mockResolvedValue([{ id: "locked" }]);
    productStockGroupFindFirstMock.mockResolvedValue({
      id: "group-1",
      storeId: "store-main",
      displayName: "Kertas A4",
      baseUnit: "lembar",
      baseStock: 1000,
      products: [],
    });
    productFindManyMock.mockResolvedValue([
      {
        id: "rim",
        unit: "rim",
        stock: 4,
        stockGroupId: null,
        unitMultiplierToBase: 500,
      },
      {
        id: "pack",
        unit: "pack",
        stock: 20,
        stockGroupId: null,
        unitMultiplierToBase: 100,
      },
    ]);
    productStockGroupUpdateMock.mockResolvedValue({ id: "group-1", baseStock: 2000 });
    productUpdateMock.mockResolvedValue({});
    inventoryLogCreateManyMock.mockResolvedValue({ count: 2 });
    dbTransactionMock.mockImplementation((callback) =>
      callback({
        $queryRaw: groupRowLockMock,
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

  it("locks source and target groups before products, then reloads authoritative state", async () => {
    const order: string[] = [];
    const products = [
      {
        id: "rim",
        unit: "rim",
        stock: 4,
        stockGroupId: "group-z",
        unitMultiplierToBase: 500,
      },
      {
        id: "pack",
        unit: "pack",
        stock: 20,
        stockGroupId: "group-a",
        unitMultiplierToBase: 100,
      },
    ];
    productFindManyMock
      .mockImplementationOnce(async () => {
        order.push("hint");
        return products;
      })
      .mockImplementationOnce(async () => {
        order.push("reload-products");
        return products;
      });
    groupRowLockMock.mockImplementation(
      async (strings: TemplateStringsArray, rowId: string) => {
        order.push(
          `${strings.join(" ").includes("pos_product_stock_groups") ? "group" : "product"}:${rowId}`,
        );
        return [{ id: rowId }];
      },
    );
    productStockGroupFindFirstMock
      .mockImplementationOnce(async () => {
        order.push("group-hint");
        return {
          id: "group-1",
          storeId: "store-main",
          displayName: "Kertas A4",
          baseUnit: "lembar",
          baseStock: 1000,
          products: [],
        };
      })
      .mockImplementationOnce(async () => {
        order.push("reload-group");
        return {
          id: "group-1",
          storeId: "store-main",
          displayName: "Kertas A4",
          baseUnit: "lembar",
          baseStock: 1000,
          products: [],
        };
      });

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
        }),
      }),
      { params: Promise.resolve({ id: "group-1" }) },
    );

    expect(response.status).toBe(200);
    expect(order).toEqual([
      "group-hint",
      "hint",
      "group:group-1",
      "group:group-a",
      "group:group-z",
      "product:pack",
      "product:rim",
      "reload-group",
      "reload-products",
    ]);
  });

  it("returns conflict when a product changes source membership after locking candidates", async () => {
    productFindManyMock
      .mockResolvedValueOnce([
        {
          id: "rim",
          unit: "rim",
          stock: 4,
          stockGroupId: null,
          unitMultiplierToBase: 500,
        },
        {
          id: "pack",
          unit: "pack",
          stock: 20,
          stockGroupId: null,
          unitMultiplierToBase: 100,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "rim",
          unit: "rim",
          stock: 4,
          stockGroupId: "group-other",
          unitMultiplierToBase: 500,
        },
        {
          id: "pack",
          unit: "pack",
          stock: 20,
          stockGroupId: null,
          unitMultiplierToBase: 100,
        },
      ]);

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
        }),
      }),
      { params: Promise.resolve({ id: "group-1" }) },
    );

    expect(response.status).toBe(409);
    expect(productStockGroupUpdateMock).not.toHaveBeenCalled();
    expect(productUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects products with units already present in the target group", async () => {
    productStockGroupFindFirstMock.mockResolvedValue({
      id: "group-1",
      storeId: "store-main",
      displayName: "Kertas A4",
      baseUnit: "rim",
      baseStock: 4,
      products: [{ id: "existing-rim", unit: "rim", stock: 4, unitMultiplierToBase: 1 }],
    });
    productFindManyMock.mockResolvedValue([
      { id: "new-rim", unit: "rim", stock: 2, stockGroupId: null },
      { id: "dus", unit: "dus", stock: 1, stockGroupId: null },
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
    groupRowLockMock.mockResolvedValue([{ id: "group-1" }]);
    productStockGroupFindFirstMock.mockResolvedValue({
      id: "group-1",
      storeId: "store-main",
      displayName: "Kertas A4",
      baseUnit: "lembar",
      baseStock: 1000,
      products: [
        {
          id: "rim",
          stockGroupId: "group-1",
          unitMultiplierToBase: 500,
        },
        {
          id: "pack",
          stockGroupId: "group-1",
          unitMultiplierToBase: 100,
        },
      ],
    });
    productStockGroupUpdateMock.mockResolvedValue({ id: "group-1", baseStock: 1500 });
    inventoryLogCreateManyMock.mockResolvedValue({ count: 2 });
    dbTransactionMock.mockImplementation((callback) =>
      callback({
        $queryRaw: groupRowLockMock,
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

  it("locks before reading the base stock used for the absolute update and audit delta", async () => {
    let currentBaseStock = 1000;
    const order: string[] = [];
    const groupState = () => ({
      id: "group-1",
      storeId: "store-main",
      displayName: "Kertas A4",
      baseUnit: "lembar",
      baseStock: currentBaseStock,
      products: [
        {
          id: "rim",
          stockGroupId: "group-1",
          unitMultiplierToBase: 500,
        },
        {
          id: "pack",
          stockGroupId: "group-1",
          unitMultiplierToBase: 100,
        },
      ],
    });
    groupRowLockMock.mockImplementation(
      async (strings: TemplateStringsArray, rowId: string) => {
        const table = strings.join(" ").includes("pos_product_stock_groups")
          ? "group"
          : "product";
        order.push(`${table}:${rowId}`);
        if (table === "group") currentBaseStock = 1200;
        return [{ id: rowId }];
      },
    );
    productStockGroupFindFirstMock
      .mockImplementationOnce(async () => {
        order.push("hint");
        return groupState();
      })
      .mockImplementationOnce(async () => {
        order.push("read");
        return groupState();
      });

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
    expect(order).toEqual([
      "hint",
      "group:group-1",
      "product:pack",
      "product:rim",
      "read",
    ]);
    const rows = inventoryLogCreateManyMock.mock.calls[0]?.[0].data;
    expect(rows[0]).toMatchObject({ productId: "rim" });
    expect(rows[0].quantity).toBeCloseTo(0.6);
    expect(rows[1]).toMatchObject({ productId: "pack", quantity: 3 });
  });

  it("returns conflict when active group membership changes before reload", async () => {
    const hint = {
        id: "group-1",
        storeId: "store-main",
        displayName: "Kertas A4",
        baseUnit: "lembar",
        baseStock: 1000,
        products: [
          {
            id: "rim",
            stockGroupId: "group-1",
            unitMultiplierToBase: 500,
          },
          {
            id: "pack",
            stockGroupId: "group-1",
            unitMultiplierToBase: 100,
          },
        ],
      };
    productStockGroupFindFirstMock
      .mockResolvedValueOnce(hint)
      .mockResolvedValueOnce({
        ...hint,
        products: hint.products.slice(0, 1),
      });

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

    expect(response.status).toBe(409);
    expect(productStockGroupUpdateMock).not.toHaveBeenCalled();
    expect(inventoryLogCreateManyMock).not.toHaveBeenCalled();
  });
});
