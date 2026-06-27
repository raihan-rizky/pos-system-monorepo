import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const getInventorySummaryMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/inventory-management", () => ({
  getInventorySummary: getInventorySummaryMock,
}));

describe("GET /api/inventory-management/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      role: "INVENTORY",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    getInventorySummaryMock.mockResolvedValue({
      urgentCount: 4,
      counts: {
        pendingStockRequests: 0,
        unverifiedOutLogs: 2,
        submittedInboundReceipts: 0,
        weeklyProofMissing: true,
        dailyMatchingIncomplete: true,
        damagedReportsPending: 0,
        needsRevisionReceipts: 0,
        rejectedOwnRequests: 0,
      },
      period: { dateKey: "2026-06-25", weekKey: "2026-W26" },
    });
  });

  it("requires inventory read permission and returns summary data", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "read");
    expect(getInventorySummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ role: "INVENTORY" }),
      }),
    );
    expect(body).toEqual({
      data: expect.objectContaining({
        urgentCount: 4,
        period: { dateKey: "2026-06-25", weekKey: "2026-W26" },
      }),
    });
  });
});
