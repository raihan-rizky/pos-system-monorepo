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
    create: vi.fn(),
    update: vi.fn(),
  },
  batchOperationItem: {
    create: vi.fn(),
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

describe("POST /api/products/import/commit", () => {
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
    txMock.batchOperation.create.mockResolvedValue({ id: "batch-1" });
    txMock.productStockGroup.findUnique.mockResolvedValue(null);
    txMock.productStockGroup.create.mockResolvedValue({
      id: "group-2",
      storeId: "store-main",
      groupKey: "amplop|jasa",
      displayName: "Amplop",
      baseUnit: "pack",
      baseStock: 10,
    });
    txMock.inventoryLog.create.mockResolvedValue({ id: "log-1" });
  });

  it("handles a SKU conflict successfully when the user decides to create with new SKU", async () => {
    // prod-1 has SKU "FC-A4"
    txMock.product.findMany.mockResolvedValue([
      {
        id: "prod-1",
        name: "Fotocopy A4",
        sku: "FC-A4",
        category: { name: "Jasa" },
        unit: "lembar",
        price: 500,
        costPrice: 100,
        stockGroupId: "group-1",
        stockGroup: { baseUnit: "lembar" },
      },
    ]);

    // Import a row with the same SKU "FC-A4" but a different product name "Amplop" (conflict!)
    const payload = {
      rows: [
        {
          rowNumber: 2,
          name: "Amplop",
          sku: "FC-A4",
          category: "Jasa",
          price: 1000,
          stock: 10,
          unit: "pack",
          costPrice: 800,
        },
      ],
      decisions: { "2": "create" },
    };

    txMock.product.create.mockResolvedValue({
      id: "prod-2",
      name: "Amplop",
      sku: "FC-A4-NEW",
    });

    const response = await POST(
      new Request("http://localhost/api/products/import/commit", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(201);
    expect(txMock.product.create).toHaveBeenCalled();
    // Verify it called create instead of update!
    expect(txMock.product.update).not.toHaveBeenCalled();
  });
});
