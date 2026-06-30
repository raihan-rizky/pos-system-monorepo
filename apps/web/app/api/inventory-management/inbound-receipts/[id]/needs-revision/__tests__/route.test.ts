import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";
import { InventoryManagementError } from "@/features/inventory-management/services/inbound-receipt-service";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const needsRevisionInboundReceiptMock = vi.hoisted(() => vi.fn());

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
    needsRevisionInboundReceipt: needsRevisionInboundReceiptMock,
  };
});

vi.mock("@/features/inventory-management/repositories/InventoryInboundReceiptRepository", () => ({
  InventoryInboundReceiptRepository: vi.fn(function InventoryInboundReceiptRepository() {
    return { kind: "repo" };
  }),
}));

function post(body: unknown = { revisionReason: "Qty perlu dicek ulang" }, id = "receipt-1") {
  return POST(
    new Request(
      `http://localhost/api/inventory-management/inbound-receipts/${id}/needs-revision`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ id }) },
  );
}

describe("POST /api/inventory-management/inbound-receipts/[id]/needs-revision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      role: "OWNER",
      storeId: "store-main",
    });
    needsRevisionInboundReceiptMock.mockResolvedValue({
      id: "receipt-1",
      status: "NEEDS_REVISION",
    });
  });

  it("requires inbound receipt revise permission and returns the needs-revision receipt", async () => {
    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      "inventory.inbound_receipt.revise",
      "update",
    );
    expect(needsRevisionInboundReceiptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ id: "owner-1" }),
        receiptId: "receipt-1",
        revisionReason: "Qty perlu dicek ulang",
      }),
    );
    expect(body.data.status).toBe("NEEDS_REVISION");
  });

  it("requires a revision reason", async () => {
    const response = await post({ revisionReason: "" });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.message).toBe("Revision reason is required");
    expect(needsRevisionInboundReceiptMock).not.toHaveBeenCalled();
  });

  it("maps service conflicts to HTTP conflict", async () => {
    needsRevisionInboundReceiptMock.mockRejectedValueOnce(
      new InventoryManagementError(
        "CONFLICT",
        "Inbound receipt status changed before revision",
        409,
      ),
    );

    const response = await post();
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toBe("Inbound receipt status changed before revision");
  });
});
