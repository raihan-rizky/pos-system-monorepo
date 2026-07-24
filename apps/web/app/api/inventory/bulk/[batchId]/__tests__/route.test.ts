import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const batchFindFirstMock = vi.hoisted(() => vi.fn());
const inventoryLogFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    batchOperation: { findFirst: batchFindFirstMock },
    inventoryLog: { findMany: inventoryLogFindManyMock },
  },
}));

describe("GET /api/inventory/bulk/[batchId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      storeId: "store-main",
    });
    inventoryLogFindManyMock.mockResolvedValue([
      { id: "log-1", product: { id: "product-1" } },
    ]);
    batchFindFirstMock.mockResolvedValue({
      id: "batch-1",
      storeId: "store-main",
      type: "INBOUND_RECEIPT",
      status: "COMMITTED",
      summary: {
        supplierName: "CV Kertas",
        goodsPurchaseNumber: "PB-202607-001",
      },
      items: [
        {
          id: "item-1",
          inventoryLogId: "log-1",
          beforeSnapshot: { stock: 10, unit: "Dus" },
          afterSnapshot: { stock: 14, unit: "Dus" },
          product: {
            id: "product-1",
            name: "Kertas A4",
            sku: "A4-001",
            stock: 14,
          },
        },
      ],
    });
  });

  it("returns every item in a store-scoped inbound receipt bundle", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ batchId: "batch-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(batchFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "batch-1", storeId: "store-main" },
      }),
    );
    expect(body.type).toBe("INBOUND_RECEIPT");
    expect(body.items[0]).toEqual(
      expect.objectContaining({
        beforeSnapshot: expect.objectContaining({ stock: 10 }),
        afterSnapshot: expect.objectContaining({ stock: 14 }),
        inventoryLog: expect.objectContaining({ id: "log-1" }),
      }),
    );
  });
});
