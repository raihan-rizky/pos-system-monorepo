import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const batchOperationFindUniqueMock = vi.hoisted(() => vi.fn());
const batchOperationUpdateMock = vi.hoisted(() => vi.fn());
const inventoryLogFindUniqueMock = vi.hoisted(() => vi.fn());
const inventoryLogFindManyMock = vi.hoisted(() => vi.fn());
const inventoryLogUpdateMock = vi.hoisted(() => vi.fn());
const productFindUniqueMock = vi.hoisted(() => vi.fn());
const productUpdateMock = vi.hoisted(() => vi.fn());
const batchOperationItemUpdateMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

function call(body: unknown) {
  return POST(
    new Request("http://localhost/api/inventory/bulk/batch-1/approve-item", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ batchId: "batch-1" }) },
  );
}

describe("POST /api/inventory/bulk/[batchId]/approve-item", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({ id: "owner-1", name: "Owner", role: "OWNER" });
    batchOperationFindUniqueMock.mockResolvedValue({
      id: "batch-1",
      type: "BULK_STOCK_ADJUSTMENT",
      status: "PENDING",
      summary: {},
      items: [{ id: "item-1", inventoryLogId: "log-1" }],
    });
    inventoryLogFindUniqueMock.mockResolvedValue({
      id: "log-1",
      productId: "product-1",
      type: "OUT",
      quantity: 4,
      status: "PENDING",
    });
    inventoryLogFindManyMock.mockResolvedValue([{ id: "log-1", status: "PENDING" }]);
    productFindUniqueMock.mockResolvedValue(product("product-1", 10));
    productUpdateMock.mockResolvedValue(product("product-1", 6));
    inventoryLogUpdateMock.mockResolvedValue({ id: "log-1", status: "APPROVED" });
    batchOperationItemUpdateMock.mockResolvedValue({ id: "item-1" });
    batchOperationUpdateMock.mockResolvedValue({ id: "batch-1", status: "COMMITTED" });
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        batchOperation: {
          findUnique: batchOperationFindUniqueMock,
          update: batchOperationUpdateMock,
        },
        inventoryLog: {
          findUnique: inventoryLogFindUniqueMock,
          findMany: inventoryLogFindManyMock,
          update: inventoryLogUpdateMock,
        },
        product: {
          findUnique: productFindUniqueMock,
          update: productUpdateMock,
        },
        batchOperationItem: {
          update: batchOperationItemUpdateMock,
        },
      }),
    );
  });

  it("approves one pending bulk item and applies its stock delta", async () => {
    const response = await call({ inventoryLogId: "log-1" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(productUpdateMock).toHaveBeenCalledWith({
      where: { id: "product-1" },
      data: { stock: 6 },
    });
    expect(inventoryLogUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "APPROVED",
          approvedBy: "owner-1",
        }),
      }),
    );
    expect(body.batchStatus).toBe("COMMITTED");
  });
});

function product(id: string, stock: number) {
  return {
    id,
    name: id,
    sku: "SKU-1",
    barcode: null,
    description: null,
    price: 1000,
    costPrice: 500,
    stock,
    minStock: 1,
    unit: "pcs",
    size: null,
    material: null,
    categoryId: "cat-1",
    storeId: "store-1",
    isActive: true,
    imageUrl: null,
  };
}
