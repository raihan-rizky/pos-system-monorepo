import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../route";

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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T08:00:00.000Z"));
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

  afterEach(() => {
    vi.useRealTimers();
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
          AND: [
            { OR: [{ reason: "USAGE" }, { reason: "MANUAL_ADJUSTMENT" }] },
            {
              OR: [
                { verification: null },
                { verification: { status: { in: ["UNVERIFIED", "MISMATCH"] } } },
              ],
            },
          ],
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

  it("builds matching rows from an approved and re-verified correction", async () => {
    inventoryLogFindManyMock.mockResolvedValue([
      {
        id: "log-1",
        productId: "product-wrong",
        quantity: 10,
        verification: { status: "VERIFIED" },
        correctionRequests: [
          {
            status: "APPROVED",
            correctedProductId: "product-right",
            correctedQuantity: 4,
            correctedProduct: {
              id: "product-right",
              name: "Tinta Hitam",
              sku: "INK-001",
              unit: "botol",
              stock: 6,
              imageUrl: null,
              category: { name: "Tinta", icon: null },
              stockGroup: null,
            },
          },
        ],
        product: {
          id: "product-wrong",
          name: "Kertas A4",
          sku: "A4-001",
          unit: "rim",
          stock: 20,
          imageUrl: null,
          category: { name: "Kertas", icon: null },
          stockGroup: null,
        },
      },
    ]);

    const response = await GET(
      new Request(
        "http://localhost/api/inventory-management/daily-stock-matching?now=2026-06-25T08:00:00.000Z",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.rows).toEqual([
      expect.objectContaining({
        productId: "product-right",
        totalOut: 4,
        expectedAfterStock: 6,
        stockBeforeOut: 10,
      }),
    ]);
  });

  it("rejects daily matching before 15:00 WIB", async () => {
    vi.setSystemTime(new Date("2026-06-25T07:59:59.000Z"));

    const response = await post({
      now: "2026-06-25T07:59:59.000Z",
      lines: [{ productId: "product-1", physicalStock: 8 }],
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.message).toContain("15:00-20:00 WIB");
    expect(inventoryLogCountMock).not.toHaveBeenCalled();
  });

  it("accepts daily matching exactly at 20:00 WIB", async () => {
    vi.setSystemTime(new Date("2026-06-25T13:00:00.000Z"));

    const response = await post({
      now: "2026-06-25T13:00:00.000Z",
      lines: [{ productId: "product-1", physicalStock: 8 }],
    });

    expect(response.status).toBe(200);
    expect(inventoryTaskUpsertMock).toHaveBeenCalled();
  });

  it("rejects daily matching after 20:00 WIB", async () => {
    vi.setSystemTime(new Date("2026-06-25T13:00:01.000Z"));

    const response = await post({
      now: "2026-06-25T13:00:01.000Z",
      lines: [{ productId: "product-1", physicalStock: 8 }],
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.message).toContain("15:00-20:00 WIB");
    expect(inventoryLogCountMock).not.toHaveBeenCalled();
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
