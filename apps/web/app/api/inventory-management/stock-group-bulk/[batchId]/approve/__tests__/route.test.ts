import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const stockRowLockMock = vi.hoisted(() => vi.fn());
const batchOperationFindUniqueMock = vi.hoisted(() => vi.fn());
const batchOperationUpdateMock = vi.hoisted(() => vi.fn());
const productStockGroupFindManyMock = vi.hoisted(() => vi.fn());
const productStockGroupUpdateMock = vi.hoisted(() => vi.fn());
const inventoryLogUpdateMock = vi.hoisted(() => vi.fn());
const batchOperationItemUpdateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

function product(overrides: Record<string, unknown>) {
  return {
    id: "product-1",
    name: "Produk",
    sku: "SKU-1",
    barcode: null,
    description: null,
    price: 1000,
    costPrice: null,
    hargaDinas: null,
    hargaAgen: null,
    stock: 0,
    minStock: 1,
    unit: "pcs",
    size: null,
    material: null,
    categoryId: "cat-1",
    storeId: "store-main",
    isActive: true,
    imageUrl: null,
    stockGroupId: null,
    unitMultiplierToBase: 1,
    conversionNeedsReview: false,
    ...overrides,
  };
}

type ApprovePost = typeof import("../route").POST;

function call(post: ApprovePost, batchId = "batch-1") {
  return post(new Request(`http://localhost/api/inventory-management/stock-group-bulk/${batchId}/approve`, {
    method: "POST",
    body: JSON.stringify({}),
  }), {
    params: Promise.resolve({ batchId }),
  });
}

describe("POST /api/inventory-management/stock-group-bulk/[batchId]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productStockGroupFindManyMock.mockReset();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-main",
    });
    stockRowLockMock.mockResolvedValue([{ id: "locked" }]);
    dbTransactionMock.mockImplementation((callback) =>
      callback({
        $queryRaw: stockRowLockMock,
        batchOperation: {
          findUnique: batchOperationFindUniqueMock,
          update: batchOperationUpdateMock,
        },
        productStockGroup: {
          findMany: productStockGroupFindManyMock,
          update: productStockGroupUpdateMock,
        },
        inventoryLog: { update: inventoryLogUpdateMock },
        batchOperationItem: { update: batchOperationItemUpdateMock },
      }),
    );
    batchOperationUpdateMock.mockResolvedValue({});
    productStockGroupUpdateMock.mockResolvedValue({});
    inventoryLogUpdateMock.mockResolvedValue({});
    batchOperationItemUpdateMock.mockResolvedValue({});
  });

  it("approves product-first Stok Bersama bundles and updates the shared group stock once", async () => {
    const sheet = product({
      id: "sheet",
      name: "Kertas A4",
      sku: "A4-LBR",
      unit: "lembar",
      unitMultiplierToBase: 1,
      stockGroupId: "group-1",
    });
    const pack = product({
      id: "pack",
      name: "Kertas A4",
      sku: "A4-PACK",
      unit: "pack",
      unitMultiplierToBase: 10,
      stockGroupId: "group-1",
    });
    batchOperationFindUniqueMock.mockResolvedValue({
      id: "batch-1",
      type: "BULK_STOCK_GROUP_ADJUSTMENT",
      status: "PENDING",
      storeId: "store-main",
      summary: {
        source: "PRODUCT_FIRST_STOCK_GROUP_BULK",
        rows: [
          {
            productId: "pack",
            stockGroupId: "group-1",
            type: "IN",
            stockInput: { mode: "VARIANT", variantProductId: "pack" },
            inputValue: 2,
          },
        ],
      },
      items: [
        { id: "item-sheet", productId: "sheet", inventoryLogId: "log-sheet" },
        { id: "item-pack", productId: "pack", inventoryLogId: "log-pack" },
      ],
    });
    productStockGroupFindManyMock.mockResolvedValue([
      {
        id: "group-1",
        displayName: "Kertas A4",
        baseUnit: "lembar",
        baseStock: 100,
        products: [sheet, pack],
      },
    ]);

    const { POST } = await import("../route");
    const response = await call(POST);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(productStockGroupUpdateMock).toHaveBeenCalledWith({
      where: { id: "group-1" },
      data: { baseStock: 120 },
    });
    expect(inventoryLogUpdateMock).toHaveBeenCalledTimes(2);
    expect(batchOperationItemUpdateMock).toHaveBeenCalledTimes(2);
    expect(batchOperationUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-1" },
        data: expect.objectContaining({
          summary: expect.objectContaining({
            reviewedBy: "owner-1",
          }),
        }),
      }),
    );
    expect(body.data.batchId).toBe("batch-1");
  });

  it("locks multiple groups before products in sorted order and computes from the reload", async () => {
    const order: string[] = [];
    const productA = product({
      id: "product-a",
      sku: "SKU-A",
      stockGroupId: "group-a",
      unitMultiplierToBase: 1,
    });
    const productZ = product({
      id: "product-z",
      sku: "SKU-Z",
      stockGroupId: "group-z",
      unitMultiplierToBase: 1,
    });
    batchOperationFindUniqueMock.mockResolvedValue({
      id: "batch-1",
      type: "BULK_STOCK_GROUP_ADJUSTMENT",
      status: "PENDING",
      storeId: "store-main",
      summary: {
        source: "PRODUCT_FIRST_STOCK_GROUP_BULK",
        rows: [
          {
            productId: "product-z",
            stockGroupId: "group-z",
            type: "IN",
            stockInput: { mode: "BASE" },
            inputValue: 2,
          },
          {
            productId: "product-a",
            stockGroupId: "group-a",
            type: "IN",
            stockInput: { mode: "BASE" },
            inputValue: 2,
          },
        ],
      },
      items: [
        { id: "item-a", productId: "product-a", inventoryLogId: "log-a" },
        { id: "item-z", productId: "product-z", inventoryLogId: "log-z" },
      ],
    });
    productStockGroupFindManyMock
      .mockImplementationOnce(async () => {
        order.push("hint");
        return [
          {
            id: "group-z",
            displayName: "Group Z",
            baseUnit: "pcs",
            baseStock: 10,
            products: [productZ],
          },
          {
            id: "group-a",
            displayName: "Group A",
            baseUnit: "pcs",
            baseStock: 20,
            products: [productA],
          },
        ];
      })
      .mockImplementationOnce(async () => {
        order.push("reload");
        return [
          {
            id: "group-z",
            displayName: "Group Z",
            baseUnit: "pcs",
            baseStock: 15,
            products: [productZ],
          },
          {
            id: "group-a",
            displayName: "Group A",
            baseUnit: "pcs",
            baseStock: 25,
            products: [productA],
          },
        ];
      });
    stockRowLockMock.mockImplementation(
      async (strings: TemplateStringsArray, rowId: string) => {
        order.push(
          `${strings.join(" ").includes("pos_product_stock_groups") ? "group" : "product"}:${rowId}`,
        );
        return [{ id: rowId }];
      },
    );

    const { POST } = await import("../route");
    const response = await call(POST);

    expect(response.status).toBe(200);
    expect(order).toEqual([
      "hint",
      "group:group-a",
      "group:group-z",
      "product:product-a",
      "product:product-z",
      "reload",
    ]);
    expect(productStockGroupUpdateMock).toHaveBeenCalledWith({
      where: { id: "group-a" },
      data: { baseStock: 27 },
    });
    expect(productStockGroupUpdateMock).toHaveBeenCalledWith({
      where: { id: "group-z" },
      data: { baseStock: 17 },
    });
  });

  it("returns conflict when a batch product leaves its hinted group before reload", async () => {
    const grouped = product({
      id: "product-1",
      stockGroupId: "group-1",
      unitMultiplierToBase: 1,
    });
    batchOperationFindUniqueMock.mockResolvedValue({
      id: "batch-1",
      type: "BULK_STOCK_GROUP_ADJUSTMENT",
      status: "PENDING",
      storeId: "store-main",
      summary: {
        source: "PRODUCT_FIRST_STOCK_GROUP_BULK",
        rows: [
          {
            productId: "product-1",
            stockGroupId: "group-1",
            type: "IN",
            stockInput: { mode: "BASE" },
            inputValue: 2,
          },
        ],
      },
      items: [
        {
          id: "item-1",
          productId: "product-1",
          inventoryLogId: "log-1",
        },
      ],
    });
    productStockGroupFindManyMock
      .mockResolvedValueOnce([
        {
          id: "group-1",
          displayName: "Group 1",
          baseUnit: "pcs",
          baseStock: 10,
          products: [grouped],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "group-1",
          displayName: "Group 1",
          baseUnit: "pcs",
          baseStock: 10,
          products: [],
        },
      ]);

    const { POST } = await import("../route");
    const response = await call(POST);

    expect(response.status).toBe(409);
    expect(productStockGroupUpdateMock).not.toHaveBeenCalled();
    expect(inventoryLogUpdateMock).not.toHaveBeenCalled();
  });
});
