import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const createInternalStockOutRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/inventory-management/services/internal-stock-out-service", () => ({
  createInternalStockOutRequest: createInternalStockOutRequestMock,
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

describe("POST /api/internal-stock-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "cashier-1",
      name: "Staff A",
      role: "CASHIER",
      storeId: "store-main",
    });
    createInternalStockOutRequestMock.mockResolvedValue({
      id: "request-1",
      status: "PENDING",
    });
  });

  it("requires inventory.update permission", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal-stock-out", {
        method: "POST",
        body: JSON.stringify({
          productId: "product-1",
          quantity: 5,
          reason: "Rusak",
        }),
      }),
    );

    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "update");
  });

  it("creates PENDING internal stock-out request", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal-stock-out", {
        method: "POST",
        body: JSON.stringify({
          productId: "product-1",
          quantity: 5,
          reason: "Rusak",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(createInternalStockOutRequestMock).toHaveBeenCalled();
    expect(body.data).toEqual({ id: "request-1", status: "PENDING" });
  });

  it("validates required fields", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal-stock-out", {
        method: "POST",
        body: JSON.stringify({
          productId: "product-1",
          quantity: 5,
        }),
      }),
    );

    expect(response.status).toBe(422);
  });
});
