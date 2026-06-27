import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const inventoryLogCountMock = vi.hoisted(() => vi.fn());
const inventoryLogFindManyMock = vi.hoisted(() => vi.fn());
const batchOperationFindFirstMock = vi.hoisted(() => vi.fn());
const inventoryTaskUpsertMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  Prisma: {},
  db: {
    inventoryLog: {
      count: inventoryLogCountMock,
      findMany: inventoryLogFindManyMock,
    },
    batchOperation: { findFirst: batchOperationFindFirstMock },
    inventoryTask: { upsert: inventoryTaskUpsertMock },
  },
}));

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/inventory-management/daily-stock-matching", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/inventory-management/daily-stock-matching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      role: "INVENTORY",
      storeId: "store-main",
    });
    inventoryLogCountMock.mockResolvedValue(0);
    inventoryLogFindManyMock.mockResolvedValue([
      {
        id: "log-1",
        productId: "product-1",
        quantity: 2,
        product: {
          id: "product-1",
          name: "Sirup Melon",
          sku: "SRP-001",
          unit: "botol",
          stock: 8,
          imageUrl: null,
          category: { name: "Minuman", icon: null },
          stockGroup: null,
        },
      },
    ]);
    batchOperationFindFirstMock.mockResolvedValue(null);
    inventoryTaskUpsertMock.mockResolvedValue({
      id: "task-1",
      type: "DAILY_STOCK_MATCHING",
      status: "SUBMITTED",
      periodKey: "2026-06-25",
    });
  });

  it("submits daily stock matching when all internal stock-out logs are verified", async () => {
    const response = await post({
      now: "2026-06-25T08:00:00.000Z",
      lines: [{ productId: "product-1", physicalStock: 8, note: "Sesuai fisik gudang" }],
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "update");
    expect(inventoryLogCountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: "OUT",
          status: "APPROVED",
          product: { storeId: "store-main" },
          verification: null,
          OR: [{ reason: "USAGE" }, { reason: "MANUAL_ADJUSTMENT" }],
        }),
      }),
    );
    expect(inventoryTaskUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId_type_periodKey: {
            storeId: "store-main",
            type: "DAILY_STOCK_MATCHING",
            periodKey: "2026-06-25",
          },
        },
        create: expect.objectContaining({
          storeId: "store-main",
          type: "DAILY_STOCK_MATCHING",
          periodType: "DAILY",
          periodKey: "2026-06-25",
          status: "SUBMITTED",
          submittedBy: "inventory-1",
        }),
      }),
    );
    expect(body.data.status).toBe("SUBMITTED");
    expect(body.data.task.periodKey).toBe("2026-06-25");
  });

  it("blocks daily matching while eligible stock-out logs remain unverified", async () => {
    inventoryLogCountMock.mockResolvedValue(2);

    const response = await post({
      now: "2026-06-25T08:00:00.000Z",
      lines: [{ productId: "product-1", physicalStock: 8 }],
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.unverifiedCount).toBe(2);
    expect(inventoryLogFindManyMock).not.toHaveBeenCalled();
    expect(inventoryTaskUpsertMock).not.toHaveBeenCalled();
  });

  it("rejects users without a store scope", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      role: "INVENTORY",
      storeId: null,
    });

    const response = await post({
      now: "2026-06-25T08:00:00.000Z",
      lines: [{ productId: "product-1", physicalStock: 8 }],
    });

    expect(response.status).toBe(403);
    expect(inventoryLogCountMock).not.toHaveBeenCalled();
    expect(inventoryTaskUpsertMock).not.toHaveBeenCalled();
  });
});
