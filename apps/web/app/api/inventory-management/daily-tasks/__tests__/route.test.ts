import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const findDailyTasksMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/inventory-management/repositories/InventoryManagementRepository", () => ({
  InventoryManagementRepository: vi.fn(function InventoryManagementRepository() {
    return { findDailyTasks: findDailyTasksMock };
  }),
}));

describe("GET /api/inventory-management/daily-tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      role: "INVENTORY",
      storeId: "store-main",
    });
    findDailyTasksMock.mockResolvedValue({
      lowStock: [{ id: "product-low" }],
      negativeStock: [{ id: "product-negative" }],
      outOfStock: [],
      missingSupplierOrCost: [{ id: "product-missing-cost" }],
      verificationCandidates: [{ id: "log-1" }],
    });
  });

  it("returns generated daily inventory queues for the requested date", async () => {
    const response = await GET(
      new Request("http://localhost/api/inventory-management/daily-tasks?date=2026-06-25"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "read");
    expect(findDailyTasksMock).toHaveBeenCalledWith("store-main", {
      dateKey: "2026-06-25",
      limit: 25,
    });
    expect(body.data.negativeStock).toEqual([{ id: "product-negative" }]);
  });

  it("rejects users without a store scope", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      role: "INVENTORY",
      storeId: null,
    });

    const response = await GET(
      new Request("http://localhost/api/inventory-management/daily-tasks?date=2026-06-25"),
    );

    expect(response.status).toBe(403);
    expect(findDailyTasksMock).not.toHaveBeenCalled();
  });
});
