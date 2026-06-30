import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";
import { InventoryManagementError } from "@/features/inventory-management/services/inbound-receipt-service";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const approveInboundReceiptMock = vi.hoisted(() => vi.fn());

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
    approveInboundReceipt: approveInboundReceiptMock,
  };
});

vi.mock("@/features/inventory-management/repositories/InventoryInboundReceiptRepository", () => ({
  InventoryInboundReceiptRepository: vi.fn(function InventoryInboundReceiptRepository() {
    return { kind: "repo" };
  }),
}));

function post(id = "receipt-1") {
  return POST(
    new Request(`http://localhost/api/inventory-management/inbound-receipts/${id}/approve`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("POST /api/inventory-management/inbound-receipts/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      role: "OWNER",
      storeId: "store-main",
    });
    approveInboundReceiptMock.mockResolvedValue({
      id: "receipt-1",
      status: "APPROVED",
    });
  });

  it("requires inbound receipt approve permission and returns the approved receipt", async () => {
    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      "inventory.inbound_receipt.approve",
      "update",
    );
    expect(approveInboundReceiptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ id: "owner-1" }),
        receiptId: "receipt-1",
      }),
    );
    expect(body.data.status).toBe("APPROVED");
  });

  it("maps service validation errors to their HTTP status", async () => {
    approveInboundReceiptMock.mockRejectedValueOnce(
      new InventoryManagementError(
        "INVALID_RECEIPT_LINE",
        "Inbound receipt line is not eligible for approval",
        422,
      ),
    );

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.message).toBe("Inbound receipt line is not eligible for approval");
  });
});
