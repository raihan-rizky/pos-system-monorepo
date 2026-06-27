import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const approveInternalStockOutRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/inventory-management/services/internal-stock-out-service", () => ({
  approveInternalStockOutRequest: approveInternalStockOutRequestMock,
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

describe("POST /api/internal-stock-out/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner A",
      role: "OWNER",
      storeId: "store-main",
    });
    approveInternalStockOutRequestMock.mockResolvedValue({
      id: "request-1",
      status: "APPROVED",
    });
  });

  it("requires inventory.approve permission", async () => {
    await POST(new Request("http://localhost/api/internal-stock-out/request-1/approve"), {
      params: { id: "request-1" },
    });

    expect(requirePermissionMock).toHaveBeenCalledWith("inventory.approve", "update");
  });

  it("approves PENDING request and reduces stock", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal-stock-out/request-1/approve"),
      { params: { id: "request-1" } },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(approveInternalStockOutRequestMock).toHaveBeenCalled();
    expect(body.data).toEqual({ id: "request-1", status: "APPROVED" });
  });
});
