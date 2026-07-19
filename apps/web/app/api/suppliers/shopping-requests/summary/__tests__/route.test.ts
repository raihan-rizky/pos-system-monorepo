import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const getShoppingRequestKpiSummaryMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ error: vi.fn() }),
}));

vi.mock(
  "@/features/suppliers/shopping-requests/repositories/shopping-requests-repository",
  () => ({ getShoppingRequestKpiSummary: getShoppingRequestKpiSummaryMock }),
);

import { GET } from "../route";

const summary = {
  pendingRequestCount: 2,
  pendingRequestedQty: 14,
  approvedRequestCount: 5,
  fulfillmentRate: 80,
};

describe("GET /api/suppliers/shopping-requests/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    getShoppingRequestKpiSummaryMock.mockResolvedValue(summary);
  });

  it("returns the KPI summary for the authenticated store", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      storeId: "store-utama",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: summary });
    expect(requirePermissionMock).toHaveBeenCalledWith("supplier", "read");
    expect(getShoppingRequestKpiSummaryMock).toHaveBeenCalledWith(
      "store-utama",
    );
  });

  it("does not fall back to another store when the user has no store", async () => {
    requirePermissionMock.mockResolvedValue({ id: "admin-1", storeId: null });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(getShoppingRequestKpiSummaryMock).not.toHaveBeenCalled();
  });
});
