import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const approveInboundReceiptItemMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock(
  "@/features/inventory-management/services/inbound-receipt-service",
  async () => {
    const actual = await vi.importActual<
      typeof import("@/features/inventory-management/services/inbound-receipt-service")
    >("@/features/inventory-management/services/inbound-receipt-service");
    return {
      ...actual,
      approveInboundReceiptItem: approveInboundReceiptItemMock,
    };
  },
);

vi.mock(
  "@/features/inventory-management/repositories/InventoryInboundReceiptRepository",
  () => ({
    InventoryInboundReceiptRepository: vi.fn(
      function InventoryInboundReceiptRepository() {
        return { kind: "repo" };
      },
    ),
  }),
);

function post() {
  return POST(
    new Request(
      "http://localhost/api/inventory-management/inbound-receipts/receipt-1/items/line-1/approval",
      { method: "POST" },
    ),
    {
      params: Promise.resolve({ id: "receipt-1", itemId: "line-1" }),
    },
  );
}

describe("POST /api/inventory-management/inbound-receipts/[id]/items/[itemId]/approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      role: "OWNER",
      storeId: "store-main",
    });
    approveInboundReceiptItemMock.mockResolvedValue({
      data: { id: "receipt-1", status: "SUBMITTED" },
      finalized: false,
    });
  });

  it("uses the exact approve permission and approves the store-scoped item", async () => {
    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      "inventory.inbound_receipt.approve",
      "update",
    );
    expect(approveInboundReceiptItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptId: "receipt-1",
        itemId: "line-1",
        user: expect.objectContaining({ storeId: "store-main" }),
      }),
    );
    expect(body).toEqual({
      data: { id: "receipt-1", status: "SUBMITTED" },
      finalized: false,
    });
  });
});
