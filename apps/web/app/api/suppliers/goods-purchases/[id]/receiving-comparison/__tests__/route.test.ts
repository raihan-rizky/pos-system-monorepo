import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const getComparisonMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock(
  "@/features/inventory-management/repositories/InventoryInboundReceiptRepository",
  () => ({
    InventoryInboundReceiptRepository: vi.fn(
      function InventoryInboundReceiptRepository() {
        return {
          getGoodsPurchaseReceivingComparison: getComparisonMock,
        };
      },
    ),
  }),
);

import { GET } from "../route";

const context = { params: Promise.resolve({ id: "gp-1" }) };

describe("GET /api/suppliers/goods-purchases/[id]/receiving-comparison", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      role: "OWNER",
      storeId: "store-main",
    });
    getComparisonMock.mockResolvedValue({
      goodsPurchaseId: "gp-1",
      goodsPurchaseNumber: "PB-202607-001",
      supplierName: "CV Kertas",
      fulfillmentStatus: "PARTIALLY_RECEIVED",
      items: [
        {
          goodsPurchaseItemId: "gpi-1",
          productName: "Kertas Dus",
          sku: "KD-1",
          unit: "dus",
          orderedQuantity: 50,
          approvedReceivedQuantity: 20,
          pendingReservedQuantity: 10,
          remainingQuantity: 20,
        },
      ],
      receipts: [
        {
          id: "receipt-1",
          createdAt: "2026-07-24T01:00:00.000Z",
          status: "APPROVED",
          approvedAt: "2026-07-24T02:00:00.000Z",
          approverName: "Owner",
          lines: [
            {
              goodsPurchaseItemId: "gpi-1",
              receivedQuantity: 20,
              matchStatus: "MATCHED",
              note: null,
            },
          ],
        },
      ],
    });
  });

  it("requires supplier read permission and returns receipt comparison", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/suppliers/goods-purchases/gp-1/receiving-comparison",
      ),
      context,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("supplier", "read");
    expect(getComparisonMock).toHaveBeenCalledWith("store-main", "gp-1");
    expect(body.data).toMatchObject({
      goodsPurchaseId: "gp-1",
      items: [
        expect.objectContaining({
          approvedReceivedQuantity: 20,
          pendingReservedQuantity: 10,
          remainingQuantity: 20,
        }),
      ],
      receipts: [
        expect.objectContaining({
          id: "receipt-1",
          approverName: "Owner",
        }),
      ],
    });
  });

  it("returns not found when the purchase does not belong to the current store", async () => {
    getComparisonMock.mockResolvedValueOnce(null);

    const response = await GET(
      new Request(
        "http://localhost/api/suppliers/goods-purchases/gp-1/receiving-comparison",
      ),
      context,
    );

    expect(response.status).toBe(404);
    expect(getComparisonMock).toHaveBeenCalledWith("store-main", "gp-1");
  });

  it("rejects users without a store before loading the comparison", async () => {
    requirePermissionMock.mockResolvedValueOnce({
      id: "owner-1",
      name: "Owner",
      role: "OWNER",
      storeId: null,
    });

    const response = await GET(
      new Request(
        "http://localhost/api/suppliers/goods-purchases/gp-1/receiving-comparison",
      ),
      context,
    );

    expect(response.status).toBe(403);
    expect(getComparisonMock).not.toHaveBeenCalled();
  });
});
