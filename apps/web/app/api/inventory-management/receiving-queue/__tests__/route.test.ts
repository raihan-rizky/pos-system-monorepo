import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const getReceivingQueueMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/inventory-management/services/inbound-receipt-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/inventory-management/services/inbound-receipt-service")
  >("@/features/inventory-management/services/inbound-receipt-service");
  return {
    ...actual,
    getReceivingQueue: getReceivingQueueMock,
  };
});

vi.mock("@/features/inventory-management/repositories/InventoryInboundReceiptRepository", () => ({
  InventoryInboundReceiptRepository: vi.fn(function InventoryInboundReceiptRepository() {
    return { kind: "repo" };
  }),
}));

describe("GET /api/inventory-management/receiving-queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      name: "Ira",
      role: "INVENTORY",
      storeId: "store-main",
    });
    getReceivingQueueMock.mockResolvedValue({
      items: [{ shoppingRequestId: "shopping-1", remainingQuantity: 5 }],
    });
  });

  it("requires inventory read permission and returns receiving queue", async () => {
    const response = await GET(
      new Request("http://localhost/api/inventory-management/receiving-queue?search=DPB&take=10"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "read");
    expect(getReceivingQueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ id: "inventory-1" }),
        input: { search: "DPB", take: 10 },
      }),
    );
    expect(body.data.items).toEqual([{ shoppingRequestId: "shopping-1", remainingQuantity: 5 }]);
  });

  it("rejects invalid query params", async () => {
    const response = await GET(
      new Request("http://localhost/api/inventory-management/receiving-queue?take=999"),
    );

    expect(response.status).toBe(422);
    expect(getReceivingQueueMock).not.toHaveBeenCalled();
  });
});
