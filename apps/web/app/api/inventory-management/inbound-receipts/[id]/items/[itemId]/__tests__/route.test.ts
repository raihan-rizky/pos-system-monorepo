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

  it("PATCH accepts a replacement product with its quantity", async () => {
    const response = await patch({ productId: "product-3", matchStatus: "MATCHED", receivedQuantity: 4, note: "Perbaikan barang" });
    expect(response.status).toBe(200);
    expect(editInboundReceiptItemMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ productId: "product-3", receivedQuantity: 4 }) }));
  });

  it("PATCH retains the displayed replacement pricing baseline", async () => {
    const pricing = { version: 2, units: [{ productId: "product-3", costPrice: 100, price: 150, hargaAgen: null, hargaDinas: null,
      baseline: { unit: "pcs", unitMultiplierToBase: 1, costPrice: 100, price: 150, hargaAgen: null, hargaDinas: null,
        pricingMode: "MANUAL", pricingSourceProductId: null, pricingConfigRevision: 3 } }] };
    const response = await patch({ productId: "product-3", matchStatus: "MATCHED", receivedQuantity: 4, pricing });
    expect(response.status).toBe(200);
    expect(editInboundReceiptItemMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ pricing }) }));
  });


  it("PATCH accepts and forwards pricing for the selected unit", async () => {
    const pricing = { productId: "unit-1", costPrice: 100, price: 150, hargaAgen: 140, hargaDinas: 130 };
    const input = { matchStatus: "MATCHED", receivedQuantity: 4, pricing, note: "Kurang satu" };
    const response = await patch(input);

    expect(response.status).toBe(200);
    expect(editInboundReceiptItemMock).toHaveBeenCalledWith(expect.objectContaining({ input }));
  });

  it("PATCH accepts omitted optional mismatch prices as null", async () => {
    const response = await patch({ matchStatus: "MISMATCHED", receivedQuantity: 4, pricing: {}, note: "Kurang satu" });

    expect(response.status).toBe(200);
    expect(editInboundReceiptItemMock.mock.calls[0][0].input.pricing).toEqual({
      productId: null, costPrice: null, price: null, hargaAgen: null, hargaDinas: null,
    });
  });

  it("PATCH rejects malformed pricing before the service call", async () => {
    const response = await patch({ matchStatus: "MATCHED", receivedQuantity: 4, pricing: { price: -1 } });
    expect(response.status).toBe(422);
    expect(editInboundReceiptItemMock).not.toHaveBeenCalled();
  });

  it("PATCH rejects malformed item data before the service call", async () => {
    const response = await patch({
      matchStatus: "UNKNOWN",
      receivedQuantity: -1,
    });

    expect(response.status).toBe(422);
    expect(editInboundReceiptItemMock).not.toHaveBeenCalled();
  });

  it("PATCH passes all-unit pricing to the review service", async () => {
    const pricing = { version: 2, units: [{ productId: "pcs", costPrice: null, price: 150, hargaAgen: null, hargaDinas: null, priceEdited: true }] };
    const response = await patch({ matchStatus: "MATCHED", receivedQuantity: 4, pricing });
    expect(response.status).toBe(200);
    expect(editInboundReceiptItemMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ pricing }) }));
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

  it("DELETE passes the displayed line version to the service", async () => {
    const response = await DELETE(new Request(
      "http://localhost/api/inventory-management/inbound-receipts/receipt-1/items/line-1",
      { method: "DELETE", body: JSON.stringify({ expectedUpdatedAt: "2026-10-31T11:00:00.000Z" }) },
    ), context);
    expect(response.status).toBe(200);
    expect(removeInboundReceiptItemMock).toHaveBeenCalledWith(expect.objectContaining({
      expectedUpdatedAt: "2026-10-31T11:00:00.000Z",
    }));
  });
});
