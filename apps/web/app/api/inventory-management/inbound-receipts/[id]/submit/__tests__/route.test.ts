import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const submitInboundReceiptMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/inventory-management/services/inbound-receipt-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/inventory-management/services/inbound-receipt-service")
  >("@/features/inventory-management/services/inbound-receipt-service");
  return { ...actual, submitInboundReceipt: submitInboundReceiptMock };
});

vi.mock("@/features/inventory-management/repositories/InventoryInboundReceiptRepository", () => ({
  InventoryInboundReceiptRepository: vi.fn(function InventoryInboundReceiptRepository() {
    return { kind: "repo" };
  }),
}));

describe("POST /api/inventory-management/inbound-receipts/[id]/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      name: "Ira",
      role: "INVENTORY",
      storeId: "store-main",
    });
    submitInboundReceiptMock.mockResolvedValue({
      id: "receipt-1",
      status: "SUBMITTED",
    });
  });

  it("requires inventory update permission and submits the receipt", async () => {
    const response = await POST(
      new Request("http://localhost/api/inventory-management/inbound-receipts/receipt-1/submit", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "receipt-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "update");
    expect(submitInboundReceiptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ id: "inventory-1" }),
        receiptId: "receipt-1",
      }),
    );
    expect(body.data.status).toBe("SUBMITTED");
  });
});
