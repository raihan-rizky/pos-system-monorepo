import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const rejectInternalStockOutRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/inventory-management/services/internal-stock-out-service", () => ({
  rejectInternalStockOutRequest: rejectInternalStockOutRequestMock,
  InventoryManagementError: class InventoryManagementError extends Error {
    constructor(
      public code: string,
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));

vi.mock("@/features/inventory-management/repositories/InternalStockOutRepository", () => ({
  InternalStockOutRepository: vi.fn(function InternalStockOutRepository() {
    return {};
  }),
}));

describe("POST /api/internal-stock-out/[id]/reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner A",
      role: "OWNER",
      storeId: "store-main",
    });
    rejectInternalStockOutRequestMock.mockResolvedValue({
      id: "request-1",
      status: "REJECTED",
    });
  });

  it("requires inventory.approve permission", async () => {
    await POST(
      new Request("http://localhost/api/internal-stock-out/request-1/reject", {
        method: "POST",
        body: JSON.stringify({ rejectionReason: "Stock tidak cukup" }),
      }),
      { params: { id: "request-1" } },
    );

    expect(requirePermissionMock).toHaveBeenCalledWith("inventory.approve", "update");
  });

  it("rejects PENDING request with reason", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal-stock-out/request-1/reject", {
        method: "POST",
        body: JSON.stringify({ rejectionReason: "Stock tidak cukup" }),
      }),
      { params: { id: "request-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rejectInternalStockOutRequestMock).toHaveBeenCalled();
    expect(body.data).toEqual({ id: "request-1", status: "REJECTED" });
  });

  it("validates rejection reason is required", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal-stock-out/request-1/reject", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: { id: "request-1" } },
    );

    expect(response.status).toBe(422);
  });
});
