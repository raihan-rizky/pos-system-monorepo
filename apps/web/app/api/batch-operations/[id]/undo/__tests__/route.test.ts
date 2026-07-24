import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

const txMock = {
  $queryRaw: vi.fn(),
  batchOperation: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  batchOperationItem: {
    create: vi.fn(),
    findFirst: vi.fn(),
  },
  inventoryLog: {
    create: vi.fn(),
  },
  product: {
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  productStockGroup: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  productSupplier: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  transactionItem: {
    findMany: vi.fn(),
  },
};

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-1",
    name: "Amplop",
    sku: "AMP-001",
    barcode: null,
    description: null,
    price: 1200,
    costPrice: 800,
    hargaDinas: null,
    hargaAgen: 1500,
    stock: 10,
    minStock: 5,
    unit: "pcs",
    size: null,
    material: null,
    categoryId: "cat-1",
    storeId: "store-main",
    isActive: true,
    imageUrl: null,
    productSuppliers: [{ supplierId: "supplier-new" }],
    ...overrides,
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  const { productSuppliers: _productSuppliers, ...rest } = product(overrides);
  return rest;
}

function sharedStockSnapshot(input: {
  stock: number;
  stockGroupId: string;
  baseStockBefore: number;
  baseStockAfter: number;
  unitMultiplier: number;
  overrides?: Record<string, unknown>;
}) {
  return {
    ...snapshot({ stock: input.stock, ...input.overrides }),
    sharedStockUndo: {
      stockGroupId: input.stockGroupId,
      baseStockBefore: input.baseStockBefore,
      baseStockAfter: input.baseStockAfter,
      unitMultiplier: input.unitMultiplier,
    },
  };
}

function batchItem(input: {
  id: string;
  productId: string;
  sku: string;
  action?: "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT";
  beforeSnapshot: Record<string, unknown>;
  afterSnapshot: Record<string, unknown>;
}) {
  return {
    id: input.id,
    batchOperationId: "batch-1",
    productId: input.productId,
    sku: input.sku,
    action: input.action ?? "STOCK_IN",
    beforeSnapshot: input.beforeSnapshot,
    afterSnapshot: input.afterSnapshot,
    inventoryLogId: `log-${input.id}`,
    createdAt: new Date("2026-07-01"),
    sourceRowNumber: Number(input.id.replace(/\D/g, "")) || null,
  };
}

function committedBatch(items: ReturnType<typeof batchItem>[]) {
  return {
    id: "batch-1",
    type: "BULK_STOCK_ADJUSTMENT",
    status: "COMMITTED",
    storeId: "store-main",
    createdAt: new Date("2026-07-01"),
    undoOfBatchId: null,
    summary: { source: "BULK_STOCK_IMPORT" },
    items,
  };
}

function mockAuthoritativeReads(input: {
  batchProducts: ReturnType<typeof product>[];
  variants: ReturnType<typeof product>[];
  groups: Array<{
    id: string;
    storeId: string;
    baseStock: number;
  }>;
  order?: string[];
}) {
  txMock.product.findMany
    .mockImplementationOnce(async () => {
      input.order?.push("read:product-hints");
      return input.batchProducts;
    })
    .mockImplementationOnce(async () => {
      input.order?.push("read:variant-hints");
      return input.variants;
    })
    .mockImplementationOnce(async () => {
      input.order?.push("read:products-after-lock");
      return input.batchProducts;
    })
    .mockImplementationOnce(async () => {
      input.order?.push("read:variants-after-lock");
      return input.variants;
    });
  txMock.productStockGroup.findMany.mockImplementation(async () => {
    input.order?.push("read:groups-after-lock");
    return input.groups;
  });
  txMock.$queryRaw.mockImplementation(
    async (strings: TemplateStringsArray, rowId: string) => {
      const kind = strings
        .join(" ")
        .includes("pos_product_stock_groups")
        ? "group"
        : "product";
      input.order?.push(`lock:${kind}:${rowId}`);
      return [{ id: rowId }];
    },
  );
  const productById = new Map(
    [...input.batchProducts, ...input.variants].map((entry) => [
      entry.id,
      entry,
    ]),
  );
  txMock.product.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: object }) => ({
      ...productById.get(where.id),
      ...data,
    }),
  );
}

describe("POST /api/batch-operations/[id]/undo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Owner",
      storeId: "store-main",
    });
    dbTransactionMock.mockImplementation((callback) => callback(txMock));
    txMock.batchOperationItem.findFirst.mockResolvedValue(null);
    txMock.batchOperation.create.mockResolvedValue({
      id: "undo-batch-1",
      type: "UNDO",
      status: "COMMITTED",
    });
    txMock.batchOperation.update.mockResolvedValue({});
    txMock.batchOperationItem.create.mockResolvedValue({ id: "undo-item-1" });
    txMock.productSupplier.deleteMany.mockResolvedValue({ count: 1 });
    txMock.productSupplier.createMany.mockResolvedValue({ count: 1 });
    txMock.transactionItem.findMany.mockResolvedValue([]);
    txMock.product.updateMany.mockResolvedValue({ count: 1 });
    txMock.productStockGroup.findMany.mockResolvedValue([]);
    txMock.productStockGroup.updateMany.mockResolvedValue({ count: 1 });
    txMock.$queryRaw.mockImplementation(
      async (_strings: TemplateStringsArray, rowId: string) => [{ id: rowId }],
    );
  });

  it("restores product supplier links from product import snapshots", async () => {
    const beforeSnapshot = snapshot({
      name: "Amplop Lama",
      price: 1000,
      costPrice: 700,
      supplierIds: ["supplier-old"],
    });
    const afterSnapshot = snapshot({ supplierIds: ["supplier-new"] });
    const currentProduct = product();
    const restoredProduct = product({
      name: "Amplop Lama",
      price: 1000,
      costPrice: 700,
      productSuppliers: [{ supplierId: "supplier-old" }],
    });

    txMock.batchOperation.findFirst.mockResolvedValue({
      id: "batch-1",
      type: "PRODUCT_IMPORT",
      status: "COMMITTED",
      storeId: "store-main",
      createdAt: new Date("2026-07-01"),
      undoOfBatchId: null,
      items: [
        {
          id: "item-1",
          batchOperationId: "batch-1",
          productId: "prod-1",
          sku: "AMP-001",
          action: "UPDATE",
          beforeSnapshot,
          afterSnapshot,
          inventoryLogId: null,
          createdAt: new Date("2026-07-01"),
          sourceRowNumber: 2,
        },
      ],
    });
    txMock.product.findMany.mockResolvedValue([currentProduct]);
    txMock.product.update.mockResolvedValue(restoredProduct);

    const response = await POST(new Request("http://localhost/api/batch-operations/batch-1/undo"), {
      params: Promise.resolve({ id: "batch-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(txMock.productSupplier.deleteMany).toHaveBeenCalledWith({
      where: { productId: "prod-1" },
    });
    expect(txMock.productSupplier.createMany).toHaveBeenCalledWith({
      data: [{ productId: "prod-1", supplierId: "supplier-old" }],
      skipDuplicates: true,
    });
  });

  it("locks a created grouped variant and reloads it before undo deactivation", async () => {
    const order: string[] = [];
    const currentProduct = product({
      stockGroupId: "group-z",
      unitMultiplierToBase: 1,
    });

    txMock.batchOperation.findFirst.mockResolvedValue({
      id: "batch-1",
      type: "PRODUCT_IMPORT",
      status: "COMMITTED",
      storeId: "store-main",
      createdAt: new Date("2026-07-01"),
      undoOfBatchId: null,
      items: [
        {
          id: "item-1",
          batchOperationId: "batch-1",
          productId: "prod-1",
          sku: "AMP-001",
          action: "CREATE",
          beforeSnapshot: null,
          afterSnapshot: snapshot(),
          inventoryLogId: null,
          createdAt: new Date("2026-07-01"),
          sourceRowNumber: 2,
        },
      ],
    });
    mockAuthoritativeReads({
      batchProducts: [currentProduct],
      variants: [currentProduct],
      groups: [],
      order,
    });
    txMock.product.update.mockImplementation(async () => {
      order.push("deactivate-product");
      return { ...currentProduct, stock: 0, isActive: false };
    });
    txMock.inventoryLog.create.mockResolvedValue({ id: "log-1" });

    const response = await POST(
      new Request("http://localhost/api/batch-operations/batch-1/undo"),
      { params: Promise.resolve({ id: "batch-1" }) },
    );

    expect(response.status).toBe(200);
    expect(order).toEqual([
      "read:product-hints",
      "read:variant-hints",
      "lock:group:group-z",
      "lock:product:prod-1",
      "read:products-after-lock",
      "read:variants-after-lock",
      "deactivate-product",
    ]);
    expect(txMock.product.update).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: { stock: 0, isActive: false },
    });
  });

  it("restores authoritative grouped base stock and every active variant shadow", async () => {
    const order: string[] = [];
    const box = product({
      id: "prod-box",
      sku: "BOX-12",
      stock: 15,
      unit: "box",
      stockGroupId: "group-1",
      unitMultiplierToBase: 12,
      stockGroup: { id: "group-1", baseStock: 180 },
    });
    const piece = product({
      id: "prod-piece",
      sku: "PCS-1",
      stock: 180,
      unit: "pcs",
      stockGroupId: "group-1",
      unitMultiplierToBase: 1,
      stockGroup: { id: "group-1", baseStock: 180 },
    });
    txMock.batchOperation.findFirst.mockResolvedValue(
      committedBatch([
        batchItem({
          id: "item-1",
          productId: "prod-box",
          sku: "BOX-12",
          beforeSnapshot: sharedStockSnapshot({
            stock: 10,
            stockGroupId: "group-1",
            baseStockBefore: 120,
            baseStockAfter: 180,
            unitMultiplier: 12,
            overrides: { id: "prod-box", sku: "BOX-12", unit: "box" },
          }),
          afterSnapshot: sharedStockSnapshot({
            stock: 15,
            stockGroupId: "group-1",
            baseStockBefore: 120,
            baseStockAfter: 180,
            unitMultiplier: 12,
            overrides: { id: "prod-box", sku: "BOX-12", unit: "box" },
          }),
        }),
      ]),
    );
    mockAuthoritativeReads({
      batchProducts: [box],
      variants: [piece, box],
      groups: [{ id: "group-1", storeId: "store-main", baseStock: 180 }],
      order,
    });
    txMock.productStockGroup.updateMany.mockImplementation(async () => {
      order.push("restore:group");
      return { count: 1 };
    });
    txMock.product.updateMany.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        order.push(`sync:${where.id}`);
        return { count: 1 };
      },
    );

    const response = await POST(
      new Request("http://localhost/api/batch-operations/batch-1/undo"),
      { params: Promise.resolve({ id: "batch-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(order.slice(0, 8)).toEqual([
      "read:product-hints",
      "read:variant-hints",
      "lock:group:group-1",
      "lock:product:prod-box",
      "lock:product:prod-piece",
      "read:products-after-lock",
      "read:variants-after-lock",
      "read:groups-after-lock",
    ]);
    expect(txMock.productStockGroup.updateMany).toHaveBeenCalledWith({
      where: {
        id: "group-1",
        storeId: "store-main",
        baseStock: 180,
      },
      data: { baseStock: 120 },
    });
    expect(txMock.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: "prod-box",
        storeId: "store-main",
        stockGroupId: "group-1",
        isActive: true,
      },
      data: { stock: 10 },
    });
    expect(txMock.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: "prod-piece",
        storeId: "store-main",
        stockGroupId: "group-1",
        isActive: true,
      },
      data: { stock: 120 },
    });
  });

  it("restores one authoritative group exactly once for multiple batch items", async () => {
    const box = product({
      id: "prod-box",
      sku: "BOX-12",
      stock: 15,
      unit: "box",
      stockGroupId: "group-1",
      unitMultiplierToBase: 12,
      stockGroup: { id: "group-1", baseStock: 180 },
    });
    const piece = product({
      id: "prod-piece",
      sku: "PCS-1",
      stock: 180,
      unit: "pcs",
      stockGroupId: "group-1",
      unitMultiplierToBase: 1,
      stockGroup: { id: "group-1", baseStock: 180 },
    });
    txMock.batchOperation.findFirst.mockResolvedValue(
      committedBatch([
        batchItem({
          id: "item-1",
          productId: "prod-box",
          sku: "BOX-12",
          beforeSnapshot: sharedStockSnapshot({
            stock: 10,
            stockGroupId: "group-1",
            baseStockBefore: 120,
            baseStockAfter: 180,
            unitMultiplier: 12,
            overrides: { id: "prod-box", sku: "BOX-12", unit: "box" },
          }),
          afterSnapshot: sharedStockSnapshot({
            stock: 15,
            stockGroupId: "group-1",
            baseStockBefore: 120,
            baseStockAfter: 180,
            unitMultiplier: 12,
            overrides: { id: "prod-box", sku: "BOX-12", unit: "box" },
          }),
        }),
        batchItem({
          id: "item-2",
          productId: "prod-piece",
          sku: "PCS-1",
          beforeSnapshot: sharedStockSnapshot({
            stock: 120,
            stockGroupId: "group-1",
            baseStockBefore: 120,
            baseStockAfter: 180,
            unitMultiplier: 1,
            overrides: { id: "prod-piece", sku: "PCS-1" },
          }),
          afterSnapshot: sharedStockSnapshot({
            stock: 180,
            stockGroupId: "group-1",
            baseStockBefore: 120,
            baseStockAfter: 180,
            unitMultiplier: 1,
            overrides: { id: "prod-piece", sku: "PCS-1" },
          }),
        }),
      ]),
    );
    mockAuthoritativeReads({
      batchProducts: [box, piece],
      variants: [piece, box],
      groups: [{ id: "group-1", storeId: "store-main", baseStock: 180 }],
    });

    const response = await POST(
      new Request("http://localhost/api/batch-operations/batch-1/undo"),
      { params: Promise.resolve({ id: "batch-1" }) },
    );

    expect(response.status).toBe(200);
    expect(txMock.productStockGroup.updateMany).toHaveBeenCalledTimes(1);
    expect(txMock.product.updateMany).toHaveBeenCalledTimes(2);
  });

  it("restores grouped and standalone products in the same undo batch", async () => {
    const box = product({
      id: "prod-box",
      sku: "BOX-12",
      stock: 15,
      unit: "box",
      stockGroupId: "group-1",
      unitMultiplierToBase: 12,
      stockGroup: { id: "group-1", baseStock: 180 },
    });
    const piece = product({
      id: "prod-piece",
      sku: "PCS-1",
      stock: 180,
      stockGroupId: "group-1",
      unitMultiplierToBase: 1,
      stockGroup: { id: "group-1", baseStock: 180 },
    });
    const standalone = product({
      id: "prod-standalone",
      sku: "SINGLE",
      stock: 20,
      stockGroupId: null,
      unitMultiplierToBase: 1,
      stockGroup: null,
    });
    txMock.batchOperation.findFirst.mockResolvedValue(
      committedBatch([
        batchItem({
          id: "item-1",
          productId: "prod-box",
          sku: "BOX-12",
          beforeSnapshot: sharedStockSnapshot({
            stock: 10,
            stockGroupId: "group-1",
            baseStockBefore: 120,
            baseStockAfter: 180,
            unitMultiplier: 12,
            overrides: { id: "prod-box", sku: "BOX-12", unit: "box" },
          }),
          afterSnapshot: sharedStockSnapshot({
            stock: 15,
            stockGroupId: "group-1",
            baseStockBefore: 120,
            baseStockAfter: 180,
            unitMultiplier: 12,
            overrides: { id: "prod-box", sku: "BOX-12", unit: "box" },
          }),
        }),
        batchItem({
          id: "item-2",
          productId: "prod-standalone",
          sku: "SINGLE",
          beforeSnapshot: snapshot({
            id: "prod-standalone",
            sku: "SINGLE",
            stock: 10,
          }),
          afterSnapshot: snapshot({
            id: "prod-standalone",
            sku: "SINGLE",
            stock: 20,
          }),
        }),
      ]),
    );
    mockAuthoritativeReads({
      batchProducts: [box, standalone],
      variants: [piece, box],
      groups: [{ id: "group-1", storeId: "store-main", baseStock: 180 }],
    });

    const response = await POST(
      new Request("http://localhost/api/batch-operations/batch-1/undo"),
      { params: Promise.resolve({ id: "batch-1" }) },
    );

    expect(response.status).toBe(200);
    expect(txMock.productStockGroup.updateMany).toHaveBeenCalledTimes(1);
    expect(txMock.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "prod-standalone" },
        data: expect.objectContaining({ stock: 10 }),
      }),
    );
  });

  it("refuses an older grouped stock batch without authoritative metadata", async () => {
    const box = product({
      id: "prod-box",
      sku: "BOX-12",
      stock: 15,
      stockGroupId: "group-1",
      unitMultiplierToBase: 12,
      stockGroup: { id: "group-1", baseStock: 180 },
    });
    txMock.batchOperation.findFirst.mockResolvedValue(
      committedBatch([
        batchItem({
          id: "item-1",
          productId: "prod-box",
          sku: "BOX-12",
          beforeSnapshot: snapshot({
            id: "prod-box",
            sku: "BOX-12",
            stock: 10,
          }),
          afterSnapshot: snapshot({
            id: "prod-box",
            sku: "BOX-12",
            stock: 15,
          }),
        }),
      ]),
    );
    mockAuthoritativeReads({
      batchProducts: [box],
      variants: [box],
      groups: [{ id: "group-1", storeId: "store-main", baseStock: 180 }],
    });

    const response = await POST(
      new Request("http://localhost/api/batch-operations/batch-1/undo"),
      { params: Promise.resolve({ id: "batch-1" }) },
    );

    expect(response.status).toBe(409);
    expect(txMock.productStockGroup.updateMany).not.toHaveBeenCalled();
    expect(txMock.batchOperation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "UNDONE" }),
      }),
    );
  });

  it("refuses inconsistent authoritative metadata for one shared group", async () => {
    const box = product({
      id: "prod-box",
      sku: "BOX-12",
      stock: 15,
      stockGroupId: "group-1",
      unitMultiplierToBase: 12,
      stockGroup: { id: "group-1", baseStock: 180 },
    });
    const piece = product({
      id: "prod-piece",
      sku: "PCS-1",
      stock: 180,
      stockGroupId: "group-1",
      unitMultiplierToBase: 1,
      stockGroup: { id: "group-1", baseStock: 180 },
    });
    txMock.batchOperation.findFirst.mockResolvedValue(
      committedBatch([
        batchItem({
          id: "item-1",
          productId: "prod-box",
          sku: "BOX-12",
          beforeSnapshot: sharedStockSnapshot({
            stock: 10,
            stockGroupId: "group-1",
            baseStockBefore: 120,
            baseStockAfter: 180,
            unitMultiplier: 12,
            overrides: { id: "prod-box", sku: "BOX-12" },
          }),
          afterSnapshot: sharedStockSnapshot({
            stock: 15,
            stockGroupId: "group-1",
            baseStockBefore: 120,
            baseStockAfter: 180,
            unitMultiplier: 12,
            overrides: { id: "prod-box", sku: "BOX-12" },
          }),
        }),
        batchItem({
          id: "item-2",
          productId: "prod-piece",
          sku: "PCS-1",
          beforeSnapshot: sharedStockSnapshot({
            stock: 100,
            stockGroupId: "group-1",
            baseStockBefore: 100,
            baseStockAfter: 180,
            unitMultiplier: 1,
            overrides: { id: "prod-piece", sku: "PCS-1" },
          }),
          afterSnapshot: sharedStockSnapshot({
            stock: 180,
            stockGroupId: "group-1",
            baseStockBefore: 100,
            baseStockAfter: 180,
            unitMultiplier: 1,
            overrides: { id: "prod-piece", sku: "PCS-1" },
          }),
        }),
      ]),
    );
    mockAuthoritativeReads({
      batchProducts: [box, piece],
      variants: [box, piece],
      groups: [{ id: "group-1", storeId: "store-main", baseStock: 180 }],
    });

    const response = await POST(
      new Request("http://localhost/api/batch-operations/batch-1/undo"),
      { params: Promise.resolve({ id: "batch-1" }) },
    );

    expect(response.status).toBe(409);
    expect(txMock.productStockGroup.updateMany).not.toHaveBeenCalled();
    expect(txMock.batchOperation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "UNDONE" }),
      }),
    );
  });
});
