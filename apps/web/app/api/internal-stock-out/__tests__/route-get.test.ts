import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

const listRequestsMock = vi.fn();

vi.mock("@/features/inventory-management/repositories/InternalStockOutRepository", () => ({
  InternalStockOutRepository: vi.fn(function InternalStockOutRepository() {
    return {
      listRequests: listRequestsMock,
    };
  }),
}));

describe("GET /api/internal-stock-out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner A",
      role: "OWNER",
      storeId: "store-main",
    });
    listRequestsMock.mockResolvedValue([
      {
        id: "request-1",
        productName: "Product A",
        quantity: 5,
        reason: "Rusak",
        status: "PENDING",
        requestedByName: "Staff A",
        requestedByRole: "CASHIER",
        createdAt: new Date().toISOString(),
      },
    ]);
  });

  it("requires inventory.approve permission to list", async () => {
    await GET(new Request("http://localhost/api/internal-stock-out?status=PENDING"));
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory.approve", "read");
  });

  it("lists pending internal stock-out requests", async () => {
    const response = await GET(
      new Request("http://localhost/api/internal-stock-out?status=PENDING"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].status).toBe("PENDING");
  });
});
