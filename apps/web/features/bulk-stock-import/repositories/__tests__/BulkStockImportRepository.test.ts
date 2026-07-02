import { beforeEach, describe, expect, it, vi } from "vitest";

import { bulkStockImportRepository } from "../BulkStockImportRepository";

const dbTransactionMock = vi.hoisted(() => vi.fn());
const supplierFindFirstMock = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
    supplier: {
      findFirst: supplierFindFirstMock,
    },
    product: {
      findMany: vi.fn(),
    },
  },
  Prisma: {},
}));

describe("bulkStockImportRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits stock import impacts with a bulk standalone stock update", async () => {
    const productFindManyMock = vi.fn().mockResolvedValue([
      product("prod-a", "SKU-A", 10),
    ]);
    const batchOperationCreateMock = vi.fn().mockResolvedValue({ id: "batch-1" });
    const batchOperationUpdateMock = vi.fn().mockResolvedValue({ id: "batch-1" });
    const inventoryLogCreateMock = vi.fn();
    const inventoryLogCreateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const batchOperationItemCreateMock = vi.fn();
    const batchOperationItemCreateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const queryRawMock = vi.fn().mockResolvedValue([{ id: "prod-a" }]);

    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        product: {
          findMany: productFindManyMock,
        },
        batchOperation: {
          create: batchOperationCreateMock,
          update: batchOperationUpdateMock,
        },
        inventoryLog: {
          create: inventoryLogCreateMock,
          createMany: inventoryLogCreateManyMock,
        },
        batchOperationItem: {
          create: batchOperationItemCreateMock,
          createMany: batchOperationItemCreateManyMock,
        },
        $queryRaw: queryRawMock,
      }),
    );

    const result = await bulkStockImportRepository.commitStockImport({
      storeId: "store-1",
      user: {
        id: "owner-1",
        name: "Owner",
        role: "OWNER",
        storeId: "store-1",
      },
      mode: "ADD",
      supplier: { id: "supplier-1", name: "CV Sinar Jaya" },
      note: "restock import",
      impacts: [
        {
          productId: "prod-a",
          sku: "SKU-A",
          quantity: 5,
          delta: 5,
          beforeStock: 10,
          afterStock: 15,
          sourceRowNumbers: [2],
        },
      ],
    });

    expect(result).toEqual({
      updatedProductCount: 1,
      inventoryLogCount: 1,
      batchOperationId: "batch-1",
      status: "COMMITTED",
      pendingApproval: false,
      undoAvailable: true,
    });
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(inventoryLogCreateMock).not.toHaveBeenCalled();
    expect(batchOperationItemCreateMock).not.toHaveBeenCalled();
    expect(inventoryLogCreateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            id: expect.any(String),
            productId: "prod-a",
            supplierId: "supplier-1",
            type: "IN",
            reason: "RESTOCK",
            quantity: 5,
            note: "restock import",
            status: "APPROVED",
          }),
        ],
      }),
    );
    const inventoryLogId = inventoryLogCreateManyMock.mock.calls[0][0].data[0].id;
    expect(batchOperationItemCreateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            batchOperationId: "batch-1",
            productId: "prod-a",
            sku: "SKU-A",
            action: "STOCK_IN",
            inventoryLogId,
          }),
        ],
      }),
    );
  });

  it("recomputes set-mode delta from transaction current stock", async () => {
    const productFindManyMock = vi.fn().mockResolvedValue([
      product("prod-a", "SKU-A", 12),
    ]);
    const batchOperationCreateMock = vi.fn().mockResolvedValue({ id: "batch-1" });
    const batchOperationUpdateMock = vi.fn().mockResolvedValue({ id: "batch-1" });
    const inventoryLogCreateMock = vi.fn();
    const inventoryLogCreateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const batchOperationItemCreateMock = vi.fn();
    const batchOperationItemCreateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const queryRawMock = vi.fn().mockResolvedValue([{ id: "prod-a" }]);

    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        product: {
          findMany: productFindManyMock,
        },
        batchOperation: {
          create: batchOperationCreateMock,
          update: batchOperationUpdateMock,
        },
        inventoryLog: {
          create: inventoryLogCreateMock,
          createMany: inventoryLogCreateManyMock,
        },
        batchOperationItem: {
          create: batchOperationItemCreateMock,
          createMany: batchOperationItemCreateManyMock,
        },
        $queryRaw: queryRawMock,
      }),
    );

    await bulkStockImportRepository.commitStockImport({
      storeId: "store-1",
      user: {
        id: "owner-1",
        name: "Owner",
        role: "OWNER",
        storeId: "store-1",
      },
      mode: "SET",
      supplier: null,
      note: "stock opname",
      impacts: [
        {
          productId: "prod-a",
          sku: "SKU-A",
          quantity: 6,
          delta: -4,
          beforeStock: 10,
          afterStock: 6,
          sourceRowNumbers: [2],
        },
      ],
    });

    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(inventoryLogCreateMock).not.toHaveBeenCalled();
    expect(batchOperationItemCreateMock).not.toHaveBeenCalled();
    expect(inventoryLogCreateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            type: "ADJUSTMENT",
            reason: "OPNAME",
            quantity: 6,
          }),
        ],
      }),
    );
  });

  it("passes allowNegative true to stock mutation when import enables it", async () => {
    const productFindManyMock = vi.fn().mockResolvedValue([
      product("prod-a", "SKU-A", 2),
    ]);
    const batchOperationCreateMock = vi.fn().mockResolvedValue({ id: "batch-1" });
    const batchOperationUpdateMock = vi.fn().mockResolvedValue({ id: "batch-1" });
    const inventoryLogCreateMock = vi.fn().mockResolvedValue({ id: "log-1" });
    const inventoryLogCreateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const batchOperationItemCreateMock = vi.fn().mockResolvedValue({ id: "item-1" });
    const batchOperationItemCreateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const queryRawMock = vi.fn().mockResolvedValue([{ id: "prod-a" }]);

    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        product: {
          findMany: productFindManyMock,
        },
        batchOperation: {
          create: batchOperationCreateMock,
          update: batchOperationUpdateMock,
        },
        inventoryLog: {
          create: inventoryLogCreateMock,
          createMany: inventoryLogCreateManyMock,
        },
        batchOperationItem: {
          create: batchOperationItemCreateMock,
          createMany: batchOperationItemCreateManyMock,
        },
        $queryRaw: queryRawMock,
      }),
    );

    await bulkStockImportRepository.commitStockImport({
      storeId: "store-1",
      user: {
        id: "owner-1",
        name: "Owner",
        role: "OWNER",
        storeId: "store-1",
      },
      mode: "SET",
      supplier: null,
      note: "allow negative opname",
      allowNegativeStock: true,
      impacts: [
        {
          productId: "prod-a",
          sku: "SKU-A",
          quantity: -5,
          delta: -7,
          beforeStock: 2,
          afterStock: -5,
          sourceRowNumbers: [2],
        },
      ],
    });

    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });

  it("bulk-updates shared stock groups and syncs grouped product display stock", async () => {
    const productFindManyMock = vi.fn().mockResolvedValue([
      product("prod-a", "SKU-A", 10, {
        stockGroupId: "group-1",
        unitMultiplierToBase: 2,
        stockGroup: { id: "group-1", baseStock: 20 },
      }),
    ]);
    const batchOperationCreateMock = vi.fn().mockResolvedValue({ id: "batch-1" });
    const batchOperationUpdateMock = vi.fn().mockResolvedValue({ id: "batch-1" });
    const inventoryLogCreateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const batchOperationItemCreateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const queryRawMock = vi
      .fn()
      .mockResolvedValueOnce([{ id: "group-1" }])
      .mockResolvedValueOnce([{ id: "prod-a" }]);

    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        product: { findMany: productFindManyMock },
        batchOperation: {
          create: batchOperationCreateMock,
          update: batchOperationUpdateMock,
        },
        inventoryLog: { createMany: inventoryLogCreateManyMock },
        batchOperationItem: { createMany: batchOperationItemCreateManyMock },
        $queryRaw: queryRawMock,
      }),
    );

    await bulkStockImportRepository.commitStockImport({
      storeId: "store-1",
      user: {
        id: "owner-1",
        name: "Owner",
        role: "OWNER",
        storeId: "store-1",
      },
      mode: "ADD",
      supplier: null,
      note: "group restock",
      impacts: [
        {
          productId: "prod-a",
          sku: "SKU-A",
          quantity: 5,
          delta: 5,
          beforeStock: 10,
          afterStock: 15,
          sourceRowNumbers: [2],
        },
      ],
    });

    expect(queryRawMock).toHaveBeenCalledTimes(2);
  });

  it("rejects owner imports that would make bulk stock negative", async () => {
    const productFindManyMock = vi.fn().mockResolvedValue([
      product("prod-a", "SKU-A", 2),
    ]);
    const batchOperationCreateMock = vi.fn().mockResolvedValue({ id: "batch-1" });
    const queryRawMock = vi.fn();

    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        product: { findMany: productFindManyMock },
        batchOperation: { create: batchOperationCreateMock },
        inventoryLog: { createMany: vi.fn() },
        batchOperationItem: { createMany: vi.fn() },
        $queryRaw: queryRawMock,
      }),
    );

    await expect(
      bulkStockImportRepository.commitStockImport({
        storeId: "store-1",
        user: {
          id: "owner-1",
          name: "Owner",
          role: "OWNER",
          storeId: "store-1",
        },
        mode: "SET",
        supplier: null,
        note: "negative stock",
        impacts: [
          {
            productId: "prod-a",
            sku: "SKU-A",
            quantity: -1,
            delta: -3,
            beforeStock: 2,
            afterStock: -1,
            sourceRowNumbers: [2],
          },
        ],
      }),
    ).rejects.toThrow("INSUFFICIENT_STOCK");
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("does not throw INCONSISTENT_STOCK_GROUP_TARGET for SET mode with multiple grouped products", async () => {
    const sharedGroup = { id: "group-1", baseStock: 20 };
    const productFindManyMock = vi.fn().mockResolvedValue([
      product("prod-a", "SKU-A", 20, {
        stockGroupId: "group-1",
        unitMultiplierToBase: 1,
        stockGroup: sharedGroup,
      }),
      product("prod-b", "SKU-B", 2, {
        id: "prod-b",
        name: "Acco plastik Joyko",
        sku: "SKU-B",
        stockGroupId: "group-1",
        unitMultiplierToBase: 10,
        stockGroup: sharedGroup,
      }),
    ]);
    const batchOperationCreateMock = vi.fn().mockResolvedValue({ id: "batch-1" });
    const batchOperationUpdateMock = vi.fn().mockResolvedValue({ id: "batch-1" });
    const inventoryLogCreateManyMock = vi.fn().mockResolvedValue({ count: 2 });
    const batchOperationItemCreateManyMock = vi.fn().mockResolvedValue({ count: 2 });
    const queryRawMock = vi
      .fn()
      .mockResolvedValueOnce([{ id: "group-1" }])
      .mockResolvedValueOnce([{ id: "prod-a" }, { id: "prod-b" }]);

    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        product: { findMany: productFindManyMock },
        batchOperation: {
          create: batchOperationCreateMock,
          update: batchOperationUpdateMock,
        },
        inventoryLog: { createMany: inventoryLogCreateManyMock },
        batchOperationItem: { createMany: batchOperationItemCreateManyMock },
        $queryRaw: queryRawMock,
      }),
    );

    // Product A (Dus, x1): target 5 → baseTarget=5, baseDelta=5-20=-15
    // Product B (Pak, x10): target 1 → baseTarget=10, baseDelta=10-20=-10
    // These differ (inconsistent), but should use finer-grained variant (prod-a, x1)
    await expect(
      bulkStockImportRepository.commitStockImport({
        storeId: "store-1",
        user: {
          id: "owner-1",
          name: "Owner",
          role: "OWNER",
          storeId: "store-1",
        },
        mode: "SET",
        supplier: null,
        note: "bulk import opname",
        impacts: [
          {
            productId: "prod-a",
            sku: "SKU-A",
            quantity: 5,
            delta: -15,
            beforeStock: 20,
            afterStock: 5,
            sourceRowNumbers: [2],
          },
          {
            productId: "prod-b",
            sku: "SKU-B",
            quantity: 1,
            delta: -1,
            beforeStock: 2,
            afterStock: 1,
            sourceRowNumbers: [3],
          },
        ],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        updatedProductCount: 2,
        status: "COMMITTED",
      }),
    );

    expect(queryRawMock).toHaveBeenCalledTimes(2);
  });
});

function product(
  id: string,
  sku: string,
  stock: number,
  overrides: Record<string, unknown> = {},
): any {
  return {
    id,
    name: "Kertas HVS A4",
    sku,
    barcode: null,
    description: null,
    price: 1000,
    costPrice: 500,
    hargaDinas: null,
    stock,
    minStock: 1,
    unit: "Rim",
    size: null,
    material: null,
    categoryId: "cat-1",
    storeId: "store-1",
    isActive: true,
    imageUrl: null,
    stockGroupId: null,
    unitMultiplierToBase: 1,
    conversionNeedsReview: false,
    category: { name: "ATK" },
    stockGroup: null,
    ...overrides,
  };
}
