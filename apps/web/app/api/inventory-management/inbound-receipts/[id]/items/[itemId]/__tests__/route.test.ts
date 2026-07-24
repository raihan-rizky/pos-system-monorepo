import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const editInboundReceiptItemMock = vi.hoisted(() => vi.fn());
const removeInboundReceiptItemMock = vi.hoisted(() => vi.fn());

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
      editInboundReceiptItem: editInboundReceiptItemMock,
      removeInboundReceiptItem: removeInboundReceiptItemMock,
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

const context = {
  params: Promise.resolve({ id: "receipt-1", itemId: "line-1" }),
};

function patch(body: unknown) {
  return PATCH(
    new Request(
      "http://localhost/api/inventory-management/inbound-receipts/receipt-1/items/line-1",
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    ),
    context,
  );
}

function remove() {
  return DELETE(
    new Request(
      "http://localhost/api/inventory-management/inbound-receipts/receipt-1/items/line-1",
      { method: "DELETE" },
    ),
    context,
  );
}

describe("/api/inventory-management/inbound-receipts/[id]/items/[itemId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      role: "OWNER",
      storeId: "store-main",
    });
    editInboundReceiptItemMock.mockResolvedValue({
      data: { id: "receipt-1", status: "SUBMITTED" },
      finalized: false,
      conflict: true,
    });
    removeInboundReceiptItemMock.mockResolvedValue({
      data: { id: "receipt-1", status: "SUBMITTED" },
      finalized: false,
    });
  });

  it("PATCH uses the exact edit permission and returns conflict info", async () => {
    const response = await patch({
      matchStatus: "MISMATCHED",
      receivedQuantity: 4,
      note: "Kurang satu",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      "inventory.inbound_receipt.edit",
      "update",
    );
    expect(editInboundReceiptItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptId: "receipt-1",
        itemId: "line-1",
        input: {
          matchStatus: "MISMATCHED",
          receivedQuantity: 4,
          note: "Kurang satu",
        },
      }),
    );
    expect(body.conflict).toBe(true);
  });

  it("PATCH rejects malformed item data before the service call", async () => {
    const response = await patch({
      matchStatus: "UNKNOWN",
      receivedQuantity: -1,
    });

    expect(response.status).toBe(422);
    expect(editInboundReceiptItemMock).not.toHaveBeenCalled();
  });

  it("DELETE uses the exact edit permission and removes only the route item", async () => {
    const response = await remove();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      "inventory.inbound_receipt.edit",
      "update",
    );
    expect(removeInboundReceiptItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptId: "receipt-1",
        itemId: "line-1",
      }),
    );
  });
});
