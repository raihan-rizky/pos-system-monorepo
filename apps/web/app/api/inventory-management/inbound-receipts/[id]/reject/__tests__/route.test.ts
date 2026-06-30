import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const rejectInboundReceiptMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/inventory-management/services/inbound-receipt-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/inventory-management/services/inbound-receipt-service")
  >("@/features/inventory-management/services/inbound-receipt-service");
  return { ...actual, rejectInboundReceipt: rejectInboundReceiptMock };
});

vi.mock("@/features/inventory-management/repositories/InventoryInboundReceiptRepository", () => ({
  InventoryInboundReceiptRepository: vi.fn(function InventoryInboundReceiptRepository() {
    return { kind: "repo" };
  }),
}));

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/inventory-management/inbound-receipts/receipt-1/reject", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "receipt-1" }) },
  );
}

describe("POST /api/inventory-management/inbound-receipts/[id]/reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      role: "OWNER",
      storeId: "store-main",
    });
    rejectInboundReceiptMock.mockResolvedValue({
      id: "receipt-1",
      status: "REJECTED",
    });
  });

  it("requires inbound receipt reject permission and sends the rejection reason to the service", async () => {
    const response = await post({ rejectionReason: "Invoice tidak sesuai" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      "inventory.inbound_receipt.reject",
      "update",
    );
    expect(rejectInboundReceiptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptId: "receipt-1",
        rejectionReason: "Invoice tidak sesuai",
      }),
    );
    expect(body.data.status).toBe("REJECTED");
  });

  it("rejects invalid bodies before calling the service", async () => {
    const response = await post({});

    expect(response.status).toBe(422);
    expect(rejectInboundReceiptMock).not.toHaveBeenCalled();
  });
});
