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
        "http://localhost/api/inventory-management/inbound-receipts?status=SUBMITTED&goodsPurchaseId=gp-1&supplierId=supplier-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "read");
    expect(listInboundReceiptsMock).toHaveBeenCalledWith("store-main", {
      status: "SUBMITTED",
      goodsPurchaseId: "gp-1",
      supplierId: "supplier-1",
    });
    expect(body.data).toEqual([{ id: "receipt-1" }]);
  });

  it("creates and submits a goods purchase receipt through the service", async () => {
    const pricing = { version: 2, units: [{ productId: "pcs", costPrice: 100, price: 150, hargaAgen: null, hargaDinas: null,
      baseline: { unit: "pcs", unitMultiplierToBase: 1, costPrice: 100, price: 150, hargaAgen: null, hargaDinas: null,
        pricingMode: "MANUAL", pricingSourceProductId: null, pricingConfigRevision: null } }] };
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
              pricing,
            },
          ],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      "inventory.inbound_receipt.create",
      "create",
    );
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
              pricing,
            },
          ],
        },
      }),
    );
    expect(createInboundReceiptMock).not.toHaveBeenCalled();
    expect(createAndSubmitInboundReceiptMock).not.toHaveBeenCalled();
    expect(body.data.status).toBe("SUBMITTED");
  });

  it("passes the payment proposal and all-unit pricing to the service", async () => {
    const pricing = { version: 2, units: [
      { productId: "pcs", costPrice: 100, price: 150, hargaAgen: null, hargaDinas: null, priceEdited: false,
        baseline: { unit: "pcs", unitMultiplierToBase: 1, costPrice: 100, price: 150, hargaAgen: null, hargaDinas: null, pricingMode: "MANUAL", pricingSourceProductId: null, pricingConfigRevision: null } },
      { productId: "box", costPrice: 1200, price: 1800, hargaAgen: 1700, hargaDinas: null, priceEdited: true,
        baseline: { unit: "box", unitMultiplierToBase: 12, costPrice: 1200, price: 1800, hargaAgen: 1700, hargaDinas: null, pricingMode: "MANUAL", pricingSourceProductId: null, pricingConfigRevision: null } },
    ] };
    const response = await POST(new Request("http://localhost/api/inventory-management/inbound-receipts", { method: "POST", body: JSON.stringify({
      goodsPurchaseId: "gp-1", paymentMethod: "GIRO", paymentDueDate: "2026-11-02",
      lines: [{ goodsPurchaseItemId: "gpi-1", matchStatus: "MATCHED", receivedQuantity: 8, pricing }],
    }) }));
    expect(response.status).toBe(201);
    expect(createAndSubmitGoodsPurchaseReceiptMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({
      paymentMethod: "GIRO", paymentDueDate: "2026-11-02", lines: [expect.objectContaining({ pricing })],
    }) }));
  });

  it("accepts two giro payments with separate dates", async () => {
    const payments = [
      { method: "GIRO", amount: 700_000, dueDate: "2026-11-14", note: "7 hari" },
      { method: "GIRO", amount: 1_300_000, dueDate: "2026-12-07", note: "30 hari" },
    ];
    const response = await POST(new Request("http://localhost/api/inventory-management/inbound-receipts", { method: "POST", body: JSON.stringify({
      goodsPurchaseId: "gp-1", payments,
      lines: [{ goodsPurchaseItemId: "gpi-1", matchStatus: "MISMATCHED", receivedQuantity: 0, note: "Belum datang", pricing: { version: 2, units: [] } }],
    }) }));
    expect(response.status).toBe(201);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory.inbound_receipt.create", "create");
    expect(createAndSubmitGoodsPurchaseReceiptMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ payments }) }));
  });

  it.each([
    { productId: "pcs", costPrice: 100, price: 150, hargaAgen: null, hargaDinas: null },
    undefined,
    { version: 2, units: [{ productId: "pcs", costPrice: 100, price: 150, hargaAgen: null, hargaDinas: null }] },
  ])("rejects a new submission without an all-unit pricing baseline", async (pricing) => {
    const response = await POST(new Request("http://localhost/api/inventory-management/inbound-receipts", {
      method: "POST", body: JSON.stringify({ goodsPurchaseId: "gp-1", paymentMethod: "TRANSFER",
        lines: [{ goodsPurchaseItemId: "gpi-1", matchStatus: "MATCHED", receivedQuantity: 8, pricing }] }),
    }));
    expect(response.status).toBe(422);
    expect(createAndSubmitGoodsPurchaseReceiptMock).not.toHaveBeenCalled();
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
