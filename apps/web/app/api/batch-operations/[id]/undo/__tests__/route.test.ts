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

describe("POST /api/batch-operations/[id]/undo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    txMock.product.findMany
      .mockImplementationOnce(async () => {
        order.push("hint-products");
        return [currentProduct];
      })
      .mockImplementationOnce(async () => {
        order.push("reload-products");
        return [currentProduct];
      });
    txMock.$queryRaw.mockImplementation(
      async (strings: TemplateStringsArray, rowId: string) => {
        order.push(
          `${strings.join(" ").includes("pos_product_stock_groups") ? "group" : "product"}:${rowId}`,
        );
        return [{ id: rowId }];
      },
    );
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
      "hint-products",
      "group:group-z",
      "product:prod-1",
      "reload-products",
      "deactivate-product",
    ]);
    expect(txMock.product.update).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: { stock: 0, isActive: false },
    });
  });
});
