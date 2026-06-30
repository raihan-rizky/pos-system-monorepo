import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const updateAndSubmitInboundReceiptMock = vi.hoisted(() => vi.fn());

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
    updateAndSubmitInboundReceipt: updateAndSubmitInboundReceiptMock,
  };
});

vi.mock("@/features/inventory-management/repositories/InventoryInboundReceiptRepository", () => ({
  InventoryInboundReceiptRepository: vi.fn(function InventoryInboundReceiptRepository() {
    return { kind: "repo" };
  }),
}));

function patch(body: unknown = validBody(), id = "receipt-1") {
  return PATCH(
    new Request(`http://localhost/api/inventory-management/inbound-receipts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function validBody() {
  return {
    note: "Sudah dicek ulang",
    lines: [
      {
        id: "line-1",
        productId: "product-1",
        expectedQuantity: 10,
        receivedQuantity: 8,
        status: "PARTIAL",
        note: "Kurang 2",
      },
    ],
  };
}

describe("PATCH /api/inventory-management/inbound-receipts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      name: "Ira",
      role: "INVENTORY",
      storeId: "store-main",
    });
    updateAndSubmitInboundReceiptMock.mockResolvedValue({
      id: "receipt-1",
      status: "SUBMITTED",
    });
  });

  it("requires inventory update permission and updates then submits the receipt", async () => {
    const response = await patch();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "update");
    expect(updateAndSubmitInboundReceiptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ id: "inventory-1" }),
        receiptId: "receipt-1",
        input: expect.objectContaining({ note: "Sudah dicek ulang" }),
      }),
    );
    expect(body.data.status).toBe("SUBMITTED");
  });

  it("rejects invalid line payloads before calling the service", async () => {
    const response = await patch({ lines: [] });

    expect(response.status).toBe(422);
    expect(updateAndSubmitInboundReceiptMock).not.toHaveBeenCalled();
  });
});
