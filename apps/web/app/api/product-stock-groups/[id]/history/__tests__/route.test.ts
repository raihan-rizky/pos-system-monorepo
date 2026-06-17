import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const activityFindManyMock = vi.hoisted(() => vi.fn());
const activityCountMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    productStockGroupActivity: {
      findMany: activityFindManyMock,
      count: activityCountMock,
    },
  },
}));

describe("GET /api/product-stock-groups/[id]/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({ id: "user-1", storeId: "store-main" });
    handleAuthErrorMock.mockReturnValue(null);
    activityCountMock.mockResolvedValue(1);
    activityFindManyMock.mockResolvedValue([
      {
        id: "activity-1",
        stockGroupId: "group-1",
        type: "CONVERSION_RATE_CHANGED",
        productId: null,
        note: "Update dus",
        person: "Owner",
        createdAt: new Date("2026-06-16T00:00:00.000Z"),
        before: { baseStock: 20 },
        after: { baseStock: 20 },
      },
    ]);
  });

  it("returns paginated conversion-rate history when requested", async () => {
    const { GET } = await import("../route");
    const response = await GET(
      new Request(
        "http://localhost/api/product-stock-groups/group-1/history?tab=conversion&page=2&limit=10",
      ),
      { params: Promise.resolve({ id: "group-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(activityFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          stockGroupId: "group-1",
          type: "CONVERSION_RATE_CHANGED",
        },
        skip: 10,
        take: 10,
      }),
    );
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        id: "activity-1",
        type: "CONVERSION_RATE_CHANGED",
        note: "Update dus",
      }),
    );
    expect(body.pagination.total).toBe(1);
  });
});
