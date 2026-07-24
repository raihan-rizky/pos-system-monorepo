import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const stockRowLockMock = vi.hoisted(() => vi.fn());
const batchOperationFindUniqueMock = vi.hoisted(() => vi.fn());
const batchOperationUpdateMock = vi.hoisted(() => vi.fn());
const inventoryLogFindManyMock = vi.hoisted(() => vi.fn());
const inventoryLogUpdateMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const productStockGroupUpdateManyMock = vi.hoisted(() => vi.fn());
const productUpdateManyMock = vi.hoisted(() => vi.fn());
const batchOperationItemUpdateMock = vi.hoisted(() => vi.fn());
const inventoryTaskUpsertMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: { $transaction: dbTransactionMock },
  Prisma: {},
}));

function groupedProduct(input: {
  id: string;
  stockGroupId: string;
  baseStock: number;
  multiplier: number;
}) {
  return {
    id: input.id,
    name: `Produk ${input.id}`,
    sku: `SKU-${input.id}`,
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
    stockGroupId: input.stockGroupId,
    unitMultiplierToBase: input.multiplier,
    conversionNeedsReview: false,
    stockGroup: {
      id: input.stockGroupId,
      baseStock: input.baseStock,
    },
  };
}

type ApprovePost = typeof import("../route").POST;

function call(post: ApprovePost) {
  return post(
    new Request(
      "http://localhost/api/inventory-management/daily-stock-matching/batch-1/approve",
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    ),
    { params: Promise.resolve({ batchId: "batch-1" }) },
  );
}

describe("POST /api/inventory-management/daily-stock-matching/[batchId]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productFindManyMock.mockReset();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    stockRowLockMock.mockResolvedValue([{ id: "locked" }]);
    batchOperationUpdateMock.mockResolvedValue({});
    inventoryLogUpdateMock.mockResolvedValue({});
    productStockGroupUpdateManyMock.mockResolvedValue({ count: 1 });
    productUpdateManyMock.mockResolvedValue({ count: 1 });
    batchOperationItemUpdateMock.mockResolvedValue({});
    inventoryTaskUpsertMock.mockResolvedValue({});
    dbTransactionMock.mockImplementation((callback) =>
      callback({
        $queryRaw: stockRowLockMock,
        batchOperation: {
          findUnique: batchOperationFindUniqueMock,
          update: batchOperationUpdateMock,
        },
        inventoryLog: {
          findMany: inventoryLogFindManyMock,
          update: inventoryLogUpdateMock,
        },
        product: {
          findMany: productFindManyMock,
          updateMany: productUpdateManyMock,
        },
        productStockGroup: {
          updateMany: productStockGroupUpdateManyMock,
        },
        batchOperationItem: { update: batchOperationItemUpdateMock },
        inventoryTask: { upsert: inventoryTaskUpsertMock },
      }),
    );
  });

  it("locks sorted groups before products and calculates targets from the post-lock reload", async () => {
    const order: string[] = [];
    batchOperationFindUniqueMock.mockResolvedValue({
      id: "batch-1",
      type: "DAILY_STOCK_MATCHING",
      status: "PENDING",
      storeId: "store-main",
      summary: {},
      createdBy: "staff-1",
      items: [
        { id: "item-z", productId: "product-z", inventoryLogId: "log-z" },
        { id: "item-a", productId: "product-a", inventoryLogId: "log-a" },
      ],
    });
    inventoryLogFindManyMock.mockResolvedValue([
      { id: "log-z", quantity: 3, status: "PENDING" },
      { id: "log-a", quantity: 4, status: "PENDING" },
    ]);
    productFindManyMock
      .mockImplementationOnce(async () => {
        order.push("hint");
        return [
          groupedProduct({
            id: "product-z",
            stockGroupId: "group-z",
            baseStock: 10,
            multiplier: 1,
          }),
          groupedProduct({
            id: "product-a",
            stockGroupId: "group-a",
            baseStock: 20,
            multiplier: 1,
          }),
        ];
      })
      .mockImplementationOnce(async () => {
        order.push("affected-hint");
        return [
          groupedProduct({
            id: "product-z",
            stockGroupId: "group-z",
            baseStock: 10,
            multiplier: 1,
          }),
          groupedProduct({
            id: "product-a",
            stockGroupId: "group-a",
            baseStock: 20,
            multiplier: 1,
          }),
        ];
      })
      .mockImplementationOnce(async () => {
        order.push("reload");
        return [
          groupedProduct({
            id: "product-z",
            stockGroupId: "group-z",
            baseStock: 30,
            multiplier: 2,
          }),
          groupedProduct({
            id: "product-a",
            stockGroupId: "group-a",
            baseStock: 40,
            multiplier: 3,
          }),
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
      "affected-hint",
      "group:group-a",
      "group:group-z",
      "product:product-a",
      "product:product-z",
      "reload",
    ]);
    expect(productStockGroupUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "group-z", storeId: "store-main" },
      data: { baseStock: 6 },
    });
    expect(productStockGroupUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "group-a", storeId: "store-main" },
      data: { baseStock: 12 },
    });
  }, 20_000);

  it("returns conflict when a product changes stock-group membership after the hint", async () => {
    batchOperationFindUniqueMock.mockResolvedValue({
      id: "batch-1",
      type: "DAILY_STOCK_MATCHING",
      status: "PENDING",
      storeId: "store-main",
      summary: {},
      createdBy: "staff-1",
      items: [
        { id: "item-1", productId: "product-1", inventoryLogId: "log-1" },
      ],
    });
    inventoryLogFindManyMock.mockResolvedValue([
      { id: "log-1", quantity: 3, status: "PENDING" },
    ]);
    productFindManyMock
      .mockResolvedValueOnce([
        groupedProduct({
          id: "product-1",
          stockGroupId: "group-a",
          baseStock: 10,
          multiplier: 1,
        }),
      ])
      .mockResolvedValueOnce([
        groupedProduct({
          id: "product-1",
          stockGroupId: "group-a",
          baseStock: 10,
          multiplier: 1,
        }),
      ])
      .mockResolvedValueOnce([
        groupedProduct({
          id: "product-1",
          stockGroupId: "group-b",
          baseStock: 10,
          multiplier: 1,
        }),
      ]);

    const { POST } = await import("../route");
    const response = await call(POST);

    expect(response.status).toBe(409);
    expect(productStockGroupUpdateManyMock).not.toHaveBeenCalled();
    expect(productUpdateManyMock).not.toHaveBeenCalled();
    expect(inventoryLogUpdateMock).not.toHaveBeenCalled();
  }, 20_000);
});
