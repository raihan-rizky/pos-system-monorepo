import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const findManyMock = vi.hoisted(() => vi.fn());
const countMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    productStockGroupActivity: {
      findMany: findManyMock,
      count: countMock,
    },
  },
}));

describe("GET /api/product-stock-groups/activities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    countMock.mockResolvedValue(1);
    findManyMock.mockResolvedValue([
      {
        id: "activity-1",
        stockGroupId: "group-1",
        type: "VARIANT_ADDED",
        note: "Tambah dus",
        createdAt: "2026-06-16T01:00:00.000Z",
        stockGroup: { id: "group-1", displayName: "HVS A4" },
        product: { id: "product-1", name: "HVS A4", sku: "HVS-A4-DUS", unit: "dus" },
      },
    ]);
  });

  it("returns store-scoped non-conversion group activities newest first", async () => {
    const { GET } = await import("../route");
    const response = await GET(
      new Request("http://localhost/api/product-stock-groups/activities?page=2&limit=10"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(countMock).toHaveBeenCalledWith({
      where: {
        stockGroup: { storeId: "store-main" },
        type: { not: "CONVERSION_RATE_CHANGED" },
      },
    });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          stockGroup: { storeId: "store-main" },
          type: { not: "CONVERSION_RATE_CHANGED" },
        },
        orderBy: { createdAt: "desc" },
        skip: 10,
        take: 10,
      }),
    );
    expect(body.data[0].type).toBe("VARIANT_ADDED");
    expect(body.pagination.total).toBe(1);
  });
});
