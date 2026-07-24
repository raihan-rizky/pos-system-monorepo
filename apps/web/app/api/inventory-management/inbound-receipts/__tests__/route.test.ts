import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const createInboundReceiptMock = vi.hoisted(() => vi.fn());
const createAndSubmitInboundReceiptMock = vi.hoisted(() => vi.fn());
const createAndSubmitGoodsPurchaseReceiptMock = vi.hoisted(() => vi.fn());
const listInboundReceiptsMock = vi.hoisted(() => vi.fn());

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
    createInboundReceipt: createInboundReceiptMock,
    createAndSubmitInboundReceipt: createAndSubmitInboundReceiptMock,
    createAndSubmitGoodsPurchaseReceipt: createAndSubmitGoodsPurchaseReceiptMock,
  };
});

vi.mock("@/features/inventory-management/repositories/InventoryInboundReceiptRepository", () => ({
  InventoryInboundReceiptRepository: vi.fn(function InventoryInboundReceiptRepository() {
    return {
      listInboundReceipts: listInboundReceiptsMock,
    };
  }),
}));

describe("/api/inventory-management/inbound-receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      name: "Ira",
      role: "INVENTORY",
      storeId: "store-main",
    });
    listInboundReceiptsMock.mockResolvedValue([{ id: "receipt-1" }]);
    createInboundReceiptMock.mockResolvedValue({
      id: "receipt-1",
      status: "DRAFT",
    });
    createAndSubmitInboundReceiptMock.mockResolvedValue({
      id: "receipt-1",
      status: "SUBMITTED",
    });
    createAndSubmitGoodsPurchaseReceiptMock.mockResolvedValue({
      id: "receipt-1",
      status: "SUBMITTED",
    });
  });

  it("lists inbound receipts for the current store", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/inventory-management/inbound-receipts?status=SUBMITTED&goodsPurchaseId=gp-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "read");
    expect(listInboundReceiptsMock).toHaveBeenCalledWith("store-main", {
      status: "SUBMITTED",
      goodsPurchaseId: "gp-1",
    });
    expect(body.data).toEqual([{ id: "receipt-1" }]);
  });

  it("creates and submits a goods purchase receipt through the service", async () => {
    const response = await POST(
      new Request("http://localhost/api/inventory-management/inbound-receipts", {
        method: "POST",
        body: JSON.stringify({
          goodsPurchaseId: "gp-1",
          note: "Surat jalan SJ-1",
          lines: [
            {
              goodsPurchaseItemId: "gpi-1",
              matchStatus: "MATCHED",
              receivedQuantity: 8,
            },
          ],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "update");
    expect(createAndSubmitGoodsPurchaseReceiptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ id: "inventory-1" }),
        input: {
          goodsPurchaseId: "gp-1",
          note: "Surat jalan SJ-1",
          lines: [
            {
              goodsPurchaseItemId: "gpi-1",
              matchStatus: "MATCHED",
              receivedQuantity: 8,
            },
          ],
        },
      }),
    );
    expect(createInboundReceiptMock).not.toHaveBeenCalled();
    expect(createAndSubmitInboundReceiptMock).not.toHaveBeenCalled();
    expect(body.data.status).toBe("SUBMITTED");
  });

  it("rejects legacy client-authoritative receipt fields", async () => {
    const response = await POST(
      new Request("http://localhost/api/inventory-management/inbound-receipts", {
        method: "POST",
        body: JSON.stringify({
          goodsPurchaseId: "gp-1",
          shoppingRequestId: "shopping-1",
          lines: [
            {
              goodsPurchaseItemId: "gpi-1",
              matchStatus: "MATCHED",
              expectedQuantity: 10,
              receivedQuantity: 10,
              status: "RECEIVED",
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(createAndSubmitGoodsPurchaseReceiptMock).not.toHaveBeenCalled();
    expect(createAndSubmitInboundReceiptMock).not.toHaveBeenCalled();
    expect(createInboundReceiptMock).not.toHaveBeenCalled();
  });

  it("rejects malformed create payloads before calling the service", async () => {
    const response = await POST(
      new Request("http://localhost/api/inventory-management/inbound-receipts", {
        method: "POST",
        body: JSON.stringify({ lines: [] }),
      }),
    );

    expect(response.status).toBe(422);
    expect(createInboundReceiptMock).not.toHaveBeenCalled();
  });
});
