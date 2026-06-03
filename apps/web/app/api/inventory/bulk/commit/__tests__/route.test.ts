import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const sendRolePushEventMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const productUpdateMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateMock = vi.hoisted(() => vi.fn());
const batchOperationCreateMock = vi.hoisted(() => vi.fn());
const batchOperationUpdateMock = vi.hoisted(() => vi.fn());
const batchOperationItemCreateMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/push-events", () => ({
  sendRolePushEvent: sendRolePushEventMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

function request(body: unknown) {
  return POST(
    new Request("http://localhost/api/inventory/bulk/commit", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("POST /api/inventory/bulk/commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      name: "Admin",
      role: "ADMIN",
      storeId: "store-1",
    });
    productFindManyMock.mockResolvedValue([
      product("product-1", "SKU-1", 10),
      product("product-2", "SKU-2", 4),
    ]);
    inventoryLogCreateMock.mockImplementation(async ({ data }) => ({
      id: `log-${data.productId}`,
      ...data,
    }));
    productUpdateMock.mockImplementation(async ({ where, data }) => ({
      ...product(where.id, "SKU-1", Number(data.stock)),
    }));
    batchOperationCreateMock.mockResolvedValue({
      id: "batch-1",
      status: "PENDING",
    });
    batchOperationUpdateMock.mockImplementation(async ({ data }) => ({
      id: "batch-1",
      ...data,
    }));
    batchOperationItemCreateMock.mockResolvedValue({ id: "item-1" });
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        product: {
          findMany: productFindManyMock,
          update: productUpdateMock,
        },
        inventoryLog: {
          create: inventoryLogCreateMock,
        },
        batchOperation: {
          create: batchOperationCreateMock,
          update: batchOperationUpdateMock,
        },
        batchOperationItem: {
          create: batchOperationItemCreateMock,
        },
      }),
    );
  });

  it("creates a PENDING batch and pending inventory logs for non-owner users without changing stock", async () => {
    const response = await request({
      productIds: ["product-1", "product-2"],
      type: "OUT",
      reason: "USAGE",
      quantities: { "product-1": 3, "product-2": 20 },
      supplierName: "Admin bundle",
      note: "bulk admin request",
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status).toBe("PENDING");
    expect(body.pendingApproval).toBe(true);
    expect(productUpdateMock).not.toHaveBeenCalled();
    expect(batchOperationCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          type: "BULK_STOCK_ADJUSTMENT",
          summary: expect.objectContaining({
            totalCount: 2,
            pendingCount: 2,
            approvedCount: 0,
            rejectedCount: 0,
          }),
        }),
      }),
    );
    expect(inventoryLogCreateMock).toHaveBeenCalledTimes(2);
    expect(inventoryLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: "product-2",
          status: "PENDING",
          quantity: 20,
        }),
      }),
    );
    expect(sendRolePushEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "bulk-inventory-request-created",
        storeId: "store-1",
        roles: ["OWNER", "ADMIN"],
      }),
    );
  });

  it("keeps owner bulk commits immediately approved and mutates stock", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      role: "OWNER",
      storeId: "store-1",
    });
    batchOperationCreateMock.mockResolvedValue({
      id: "batch-1",
      status: "COMMITTED",
    });
    productFindManyMock.mockResolvedValue([product("product-1", "SKU-1", 10)]);

    const response = await request({
      productIds: ["product-1"],
      type: "IN",
      reason: "RESTOCK",
      quantities: { "product-1": 5 },
      supplierName: "Owner bundle",
      note: "owner restock",
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status).toBe("COMMITTED");
    expect(body.pendingApproval).toBe(false);
    expect(productUpdateMock).toHaveBeenCalledWith({
      where: { id: "product-1" },
      data: { stock: 15 },
    });
    expect(inventoryLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "APPROVED",
          approvedBy: "owner-1",
        }),
      }),
    );
    expect(batchOperationUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          summary: expect.objectContaining({
            totalCount: 1,
            pendingCount: 0,
            approvedCount: 1,
            rejectedCount: 0,
          }),
        }),
      }),
    );
  });

  it("allows supplier name to be omitted and uses the batch note as the bundle name", async () => {
    const response = await request({
      productIds: ["product-1", "product-2"],
      type: "IN",
      reason: "RESTOCK",
      quantities: { "product-1": 3, "product-2": 2 },
      note: "stok awal event",
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status).toBe("PENDING");
    expect(batchOperationCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          summary: expect.objectContaining({
            productName: "stok awal event",
            supplierName: "",
          }),
        }),
      }),
    );
    expect(inventoryLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          note: "stok awal event",
        }),
      }),
    );
  });
});

function product(id: string, sku: string, stock: number) {
  return {
    id,
    name: id,
    sku,
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
