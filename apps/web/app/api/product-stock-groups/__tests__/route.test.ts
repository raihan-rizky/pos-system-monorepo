import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productStockGroupFindManyMock = vi.hoisted(() => vi.fn());
const productStockGroupCountMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const stockRowLockMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const productStockGroupCreateMock = vi.hoisted(() => vi.fn());
const productStockGroupUpdateMock = vi.hoisted(() => vi.fn());
const productUpdateMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    productStockGroup: {
      findMany: productStockGroupFindManyMock,
      count: productStockGroupCountMock,
    },
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

describe("GET /api/product-stock-groups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({ id: "user-1", storeId: "store-main" });
    handleAuthErrorMock.mockReturnValue(null);
    productStockGroupCountMock.mockResolvedValue(1);
    productStockGroupFindManyMock.mockResolvedValue([
      {
        id: "group-1",
        displayName: "Kertas A4",
        baseUnit: "lembar",
        baseStock: 1000,
        products: [
          { id: "rim", unit: "rim", unitMultiplierToBase: 500 },
          { id: "pack", unit: "pack", unitMultiplierToBase: 100 },
        ],
      },
    ]);
  });

  it("lists stock groups with at least the requested variant count", async () => {
    const { GET } = await import("../route");
    const response = await GET(
      new Request("http://localhost/api/product-stock-groups?minVariants=2"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(productStockGroupFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-main",
        }),
      }),
    );
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        id: "group-1",
        variantCount: 2,
        baseStock: 1000,
      }),
    );
  });
});

describe("POST /api/product-stock-groups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productFindManyMock.mockReset();
    requirePermissionMock.mockResolvedValue({ id: "owner-1", name: "Owner", storeId: "store-main" });
    handleAuthErrorMock.mockReturnValue(null);
    stockRowLockMock.mockResolvedValue([{ id: "locked" }]);
    productFindManyMock.mockResolvedValue([
      { id: "rim", storeId: "store-main", unit: "rim", stock: 3, stockGroupId: null, unitMultiplierToBase: 500, stockGroup: null },
      { id: "pack", storeId: "store-main", unit: "pack", stock: 15, stockGroupId: null, unitMultiplierToBase: 100, stockGroup: null },
    ]);
    productStockGroupCreateMock.mockResolvedValue({
      id: "group-new",
      displayName: "Kertas A4",
      baseUnit: "lembar",
      baseStock: 1500,
    });
    productStockGroupUpdateMock.mockResolvedValue({});
    productUpdateMock.mockResolvedValue({});
    inventoryLogCreateManyMock.mockResolvedValue({ count: 2 });
    dbTransactionMock.mockImplementation((callback) =>
      callback({
        $queryRaw: stockRowLockMock,
        product: { findMany: productFindManyMock, update: productUpdateMock },
        productStockGroup: {
          create: productStockGroupCreateMock,
          update: productStockGroupUpdateMock,
        },
        inventoryLog: { createMany: inventoryLogCreateManyMock },
      }),
    );
  });

  it("creates a manual stock group, assigns products, and writes variant adjustment logs", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/product-stock-groups", {
        method: "POST",
        body: JSON.stringify({
          displayName: "Kertas A4",
          baseUnit: "lembar",
          sharedStock: 3,
          stockInput: { mode: "VARIANT", variantProductId: "rim" },
          products: [
            { productId: "rim", unitMultiplierToBase: 500 },
            { productId: "pack", unitMultiplierToBase: 100 },
          ],
          note: "Initial manual group",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.id).toBe("group-new");
    expect(productStockGroupCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          displayName: "Kertas A4",
          baseUnit: "lembar",
          baseStock: 1500,
        }),
      }),
    );
    expect(productUpdateMock).toHaveBeenCalledTimes(2);
    expect(inventoryLogCreateManyMock).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ productId: "rim", quantity: 3 }),
        expect.objectContaining({ productId: "pack", quantity: 15 }),
      ]),
    });
  });

  it("creates a stock group from source product stock and pair conversion", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/product-stock-groups", {
        method: "POST",
        body: JSON.stringify({
          displayName: "Kertas A4",
          sourceProductId: "rim",
          products: [{ productId: "rim" }, { productId: "pack" }],
          conversionPairs: [
            {
              fromProductId: "pack",
              fromQuantity: 1,
              toProductId: "rim",
              toQuantity: 5,
            },
          ],
          note: "Initial pair group",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(productStockGroupCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          baseUnit: "rim",
          baseStock: 3,
        }),
      }),
    );
    expect(productUpdateMock).toHaveBeenCalledWith({
      where: { id: "pack" },
      data: {
        stockGroupId: "group-new",
        unitMultiplierToBase: 5,
        conversionNeedsReview: false,
      },
    });
  });

  it("locks standalone products in sorted order and reloads them before creating the group", async () => {
    const order: string[] = [];
    const products = [
      {
        id: "rim",
        storeId: "store-main",
        unit: "rim",
        stock: 3,
        stockGroupId: null,
      },
      {
        id: "pack",
        storeId: "store-main",
        unit: "pack",
        stock: 15,
        stockGroupId: null,
      },
    ];
    productFindManyMock
      .mockImplementationOnce(async () => {
        order.push("hint");
        return products;
      })
      .mockImplementationOnce(async () => {
        order.push("reload");
        return products;
      });
    stockRowLockMock.mockImplementation(
      async (strings: TemplateStringsArray, rowId: string) => {
        order.push(
          `${strings.join(" ").includes("pos_product_stock_groups") ? "group" : "product"}:${rowId}`,
        );
        return [{ id: rowId }];
      },
    );
    productStockGroupCreateMock.mockImplementationOnce(async (args) => {
      order.push("create");
      return {
        id: "group-new",
        displayName: "Kertas A4",
        baseUnit: "lembar",
        baseStock: args.data.baseStock,
      };
    });

    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/product-stock-groups", {
        method: "POST",
        body: JSON.stringify({
          displayName: "Kertas A4",
          sharedStock: 1500,
          stockInput: { mode: "BASE" },
          products: [
            { productId: "rim", unitMultiplierToBase: 500 },
            { productId: "pack", unitMultiplierToBase: 100 },
          ],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(order).toEqual([
      "hint",
      "product:pack",
      "product:rim",
      "reload",
      "create",
    ]);
  });

  it("returns conflict when a standalone product joins another group before reload", async () => {
    productFindManyMock
      .mockResolvedValueOnce([
        { id: "rim", unit: "rim", stock: 3, stockGroupId: null },
        { id: "pack", unit: "pack", stock: 15, stockGroupId: null },
      ])
      .mockResolvedValueOnce([
        { id: "rim", unit: "rim", stock: 3, stockGroupId: "group-other" },
        { id: "pack", unit: "pack", stock: 15, stockGroupId: null },
      ]);

    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/product-stock-groups", {
        method: "POST",
        body: JSON.stringify({
          displayName: "Kertas A4",
          sharedStock: 1500,
          stockInput: { mode: "BASE" },
          products: [
            { productId: "rim", unitMultiplierToBase: 500 },
            { productId: "pack", unitMultiplierToBase: 100 },
          ],
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(productStockGroupCreateMock).not.toHaveBeenCalled();
    expect(productUpdateMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate units during confirmation", async () => {
    productFindManyMock.mockResolvedValue([
      { id: "rim-1", unit: "rim", stock: 3, stockGroupId: null },
      { id: "rim-2", unit: "rim", stock: 4, stockGroupId: null },
    ]);

    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/product-stock-groups", {
        method: "POST",
        body: JSON.stringify({
          displayName: "Kertas A4",
          sourceProductId: "rim-1",
          products: [{ productId: "rim-1" }, { productId: "rim-2" }],
          conversionPairs: [
            {
              fromProductId: "rim-2",
              fromQuantity: 1,
              toProductId: "rim-1",
              toQuantity: 1,
            },
          ],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.errors.products).toContain("DUPLICATE_UNIT");
  });
});
