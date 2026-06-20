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
  product: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  category: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  batchOperation: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  batchOperationItem: {
    create: vi.fn(),
    createMany: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  },
  productImportPlannedRow: {
    count: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  productPriceLog: {
    createMany: vi.fn(),
  },
  productStockGroup: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  inventoryLog: {
    create: vi.fn(),
  },
};

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
  Prisma: {
    InputJsonValue: {},
  },
}));

describe("POST /api/products/import/commit/chunk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Owner",
      storeId: "store-main",
    });
    dbTransactionMock.mockImplementation((callback) => callback(txMock));
    txMock.category.findMany.mockResolvedValue([{ id: "cat-1", name: "Jasa" }]);
    txMock.batchOperation.findFirst.mockResolvedValue({
      id: "batch-1",
      type: "PRODUCT_IMPORT",
      status: "PENDING",
      storeId: "store-main",
      summary: {
        rowCount: 1,
        chunkSize: 75,
        createdProductCount: 1,
        variantProductCount: 0,
        updatedProductCount: 0,
        skippedRowCount: 0,
        conversionReviewCount: 0,
        createdCategoryCount: 0,
        inventoryLogCount: 1,
        priceLogCount: 1,
      },
    });
    txMock.product.findMany.mockResolvedValue([]);
    txMock.productImportPlannedRow.findMany.mockResolvedValue([
      {
        batchOperationId: "batch-1",
        sourceRowNumber: 2,
        cursorIndex: 0,
        status: "COMMITTED",
        sku: "AMP-001",
        productId: null,
        commitAction: "create",
        rowData: {
          rowNumber: 2,
          name: "Amplop",
          sku: "AMP-001",
          category: "Jasa",
          price: 1000,
          stock: 10,
          unit: "pack",
          costPrice: 800,
          duplicateInFile: false,
          missingCategory: false,
          warnings: [],
          errors: [],
          autoAction: "create",
        },
      },
    ]);
    txMock.productImportPlannedRow.count.mockImplementation(async ({ where }) => {
      if (where.status?.not) return 0;
      return 1;
    });
    txMock.productImportPlannedRow.updateMany.mockResolvedValue({ count: 0 });
    txMock.batchOperationItem.findMany.mockResolvedValue([{ sourceRowNumber: 2 }]);
    txMock.batchOperationItem.createMany.mockResolvedValue({ count: 0 });
    txMock.batchOperationItem.count.mockResolvedValue(1);
  });

  it("does not mutate products again when a retried chunk row is already committed", async () => {
    const response = await POST(
      new Request("http://localhost/api/products/import/commit/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchOperationId: "batch-1",
          cursor: 0,
          chunkSize: 75,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.done).toBe(true);
    expect(body.committedRowCount).toBe(1);
    expect(txMock.product.create).not.toHaveBeenCalled();
    expect(txMock.product.update).not.toHaveBeenCalled();
    expect(txMock.batchOperationItem.create).not.toHaveBeenCalled();
  });

  it("processes auto price updates without touching stock groups", async () => {
    const existingProduct = {
      id: "prod-1",
      name: "Cetakan R3-05",
      sku: "Cetakan R3-05",
      barcode: null,
      description: null,
      price: 1000,
      costPrice: 700,
      hargaDinas: null,
      stock: 10,
      stockGroupId: "group-1",
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
      minStock: 5,
      unit: "pcs",
      size: null,
      material: null,
      categoryId: "cat-1",
      storeId: "store-main",
      isActive: true,
      imageUrl: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      category: { name: "Jasa" },
      stockGroup: { id: "group-1", baseUnit: "pcs", baseStock: 10 },
    };
    txMock.product.findMany.mockResolvedValue([existingProduct]);
    txMock.product.update.mockResolvedValue({
      ...existingProduct,
      price: 1200,
      costPrice: 800,
    });
    txMock.productPriceLog.createMany.mockResolvedValue({ count: 2 });
    txMock.productImportPlannedRow.findMany.mockResolvedValue([
      {
        batchOperationId: "batch-1",
        sourceRowNumber: 441,
        cursorIndex: 0,
        status: "PENDING",
        sku: "Cetakan R3-05",
        productId: "prod-1",
        commitAction: "update-price",
        rowData: {
          rowNumber: 441,
          name: "Cetakan R3-05",
          sku: "Cetakan R3-05",
          category: "Jasa",
          price: 1200,
          stock: 10,
          unit: "pcs",
          costPrice: 800,
          duplicateInFile: false,
          missingCategory: false,
          warnings: [],
          errors: [],
          autoAction: "auto_price_update",
          matchedProductId: "prod-1",
        },
      },
    ]);
    txMock.batchOperationItem.findMany.mockResolvedValue([]);
    txMock.batchOperationItem.create.mockResolvedValue({ id: "item-1" });
    txMock.batchOperationItem.createMany.mockResolvedValue({ count: 1 });
    txMock.batchOperationItem.count.mockResolvedValue(1);
    txMock.productImportPlannedRow.updateMany.mockResolvedValue({ count: 1 });

    const response = await POST(
      new Request("http://localhost/api/products/import/commit/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchOperationId: "batch-1",
          cursor: 0,
          chunkSize: 75,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(txMock.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "prod-1" },
        data: expect.objectContaining({ price: 1200, costPrice: 800 }),
      }),
    );
    expect(txMock.batchOperationItem.create).not.toHaveBeenCalled();
    expect(txMock.batchOperationItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            batchOperationId: "batch-1",
            productId: "prod-1",
            sku: "Cetakan R3-05",
            sourceRowNumber: 441,
            action: "UPDATE",
          }),
        ],
        skipDuplicates: true,
      }),
    );
    expect(txMock.productStockGroup.update).not.toHaveBeenCalled();
    expect(txMock.inventoryLog.create).not.toHaveBeenCalled();
  });

  it("fast paths auto skipped rows without mutating products", async () => {
    const existingProduct = {
      id: "prod-skip-1",
      name: "Amplop Lama",
      sku: "AMP-001",
      barcode: null,
      description: null,
      price: 1000,
      costPrice: 800,
      hargaDinas: null,
      stock: 10,
      stockGroupId: "group-1",
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
      minStock: 5,
      unit: "pack",
      size: null,
      material: null,
      categoryId: "cat-1",
      storeId: "store-main",
      isActive: true,
      imageUrl: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      category: { name: "Jasa" },
      stockGroup: { id: "group-1", baseUnit: "pack", baseStock: 10 },
    };
    txMock.product.findMany.mockResolvedValue([existingProduct]);
    txMock.productImportPlannedRow.findMany.mockResolvedValue([
      {
        batchOperationId: "batch-1",
        sourceRowNumber: 8,
        cursorIndex: 0,
        status: "PENDING",
        sku: "AMP-001",
        productId: "prod-skip-1",
        commitAction: "skip",
        rowData: {
          rowNumber: 8,
          name: "Amplop Lama",
          sku: "AMP-001",
          category: "Jasa",
          price: 1000,
          stock: 10,
          unit: "pack",
          costPrice: 800,
          duplicateInFile: false,
          missingCategory: false,
          warnings: [],
          errors: [],
          autoAction: "auto_skip",
          matchedProductId: "prod-skip-1",
        },
      },
    ]);
    txMock.batchOperationItem.findMany.mockResolvedValue([]);
    txMock.batchOperationItem.createMany.mockResolvedValue({ count: 1 });
    txMock.batchOperationItem.count.mockResolvedValue(1);
    txMock.productImportPlannedRow.updateMany.mockResolvedValue({ count: 1 });

    const response = await POST(
      new Request("http://localhost/api/products/import/commit/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchOperationId: "batch-1",
          cursor: 0,
          chunkSize: 75,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(txMock.product.update).not.toHaveBeenCalled();
    expect(txMock.product.create).not.toHaveBeenCalled();
    expect(txMock.productPriceLog.createMany).not.toHaveBeenCalled();
    expect(txMock.batchOperationItem.create).not.toHaveBeenCalled();
    expect(txMock.batchOperationItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            batchOperationId: "batch-1",
            productId: "prod-skip-1",
            sku: "AMP-001",
            sourceRowNumber: 8,
            action: "SKIP",
            beforeSnapshot: expect.any(Object),
            afterSnapshot: expect.any(Object),
          }),
        ],
        skipDuplicates: true,
      }),
    );
  });
});
