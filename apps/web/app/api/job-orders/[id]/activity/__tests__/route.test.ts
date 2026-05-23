import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productionActivityFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    productionActivityLog: {
      findMany: productionActivityFindManyMock,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    error: vi.fn(),
  }),
}));

describe("GET /api/job-orders/[id]/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "staff-1",
      name: "Staff User",
      role: "CASHIER",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    productionActivityFindManyMock.mockResolvedValue([]);
  });

  it("returns recent activity for a single job order", async () => {
    const { GET } = await import("../route");
    const response = await GET(
      new Request("http://localhost/api/job-orders/job-1/activity"),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("production", "read");
    expect(productionActivityFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-main",
          transactionId: "job-1",
          createdAt: { gte: expect.any(Date) },
        }),
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    );
  });
});
