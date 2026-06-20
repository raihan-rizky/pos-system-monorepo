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

  it("limits the initial product lookup to import candidates", async () => {
    txMock.product.findMany.mockResolvedValue([]);

    const payload = {
      rows: [
        {
          rowNumber: 2,
          name: "Amplop",
          sku: "AMP-001",
          category: "Jasa",
          price: 1000,
          stock: 10,
          unit: "pack",
          matchedProductId: "prod-preview-1",
        },
      ],
      decisions: {},
    };

    txMock.product.create.mockResolvedValue({
      id: "prod-2",
      name: "Amplop",
      sku: "AMP-001",
    });

    const response = await POST(
      new Request("http://localhost/api/products/import/commit", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(201);
    expect(txMock.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-main",
          OR: expect.arrayContaining([
            { sku: { in: ["AMP-001"] } },
            { id: { in: ["prod-preview-1"] } },
            {
              categoryId: { in: ["cat-1"] },
              name: { in: ["Amplop"] },
            },
          ]),
        }),
        select: expect.objectContaining({
          id: true,
          sku: true,
          category: { select: { name: true } },
          stockGroup: { select: { id: true, baseUnit: true, baseStock: true } },
        }),
      }),
    );
  });

  it("commits same-family duplicate SKUs when all duplicate rows are marked create", async () => {
    txMock.product.findMany.mockResolvedValue([]);
    txMock.product.create
      .mockResolvedValueOnce({
        id: "prod-1",
        name: "Amplop",
        sku: "AMP",
      })
      .mockResolvedValueOnce({
        id: "prod-2",
        name: "Amplop",
        sku: "AMP-PCS",
      });

    const payload = {
      rows: [
        {
          rowNumber: 2,
          name: "Amplop",
          sku: "AMP",
          category: "Jasa",
          price: 1000,
          stock: 10,
          unit: "pack",
        },
        {
          rowNumber: 3,
          name: "Amplop",
          sku: "AMP",
          category: "Jasa",
          price: 1000,
          stock: 0,
          unit: "pcs",
        },
      ],
      decisions: { "2": "create", "3": "create" },
    };

    const response = await POST(
      new Request("http://localhost/api/products/import/commit", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.createdProductCount).toBe(2);
    expect(body.variantProductCount).toBe(1);
    expect(txMock.product.create).toHaveBeenCalledTimes(2);
    expect(txMock.product.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ sku: "AMP" }),
      }),
    );
    expect(txMock.product.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ sku: "AMP-PCS" }),
      }),
    );
  });
});
