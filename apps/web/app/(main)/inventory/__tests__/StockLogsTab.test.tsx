import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StockLogsTab, { groupBulkLogs } from "../StockLogsTab";

const useInventoryLogsMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useInventoryLogs", () => ({
  useInventoryLogs: useInventoryLogsMock,
  useApproveInventoryLog: () => ({ isPending: false }),
  useRejectInventoryLog: () => ({ isPending: false }),
  useCancelInventoryLog: () => ({ isPending: false }),
}));

vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({
    role: "INVENTORY",
    userId: "user-1",
    canPerform: () => true,
  }),
}));

vi.mock("@/features/bulk-stock-approval/hooks/useBulkApproval", () => ({
  useCancelBulkBatch: () => ({ isPending: false }),
}));

vi.mock("@/features/internal-use-recap/hooks/useInternalUseRecap", () => ({
  useInternalUseRecap: () => ({
    data: {
      data: {
        range: { label: "1 Jun - 7 Jun" },
        summary: { entryCount: 0, productCount: 0, totalQuantity: 0, totalValue: 0 },
        products: [],
      },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useProducts", () => ({
  useProducts: () => ({
    data: [],
    isFetching: false,
  }),
}));

describe("StockLogsTab", () => {
  beforeEach(() => {
    useInventoryLogsMock.mockReturnValue({
      data: {
        data: [],
        pagination: { total: 0, pendingTotal: 0, page: 1, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
    });
  });

  it("uses responsive root container and wraps the content safely", () => {
    const html = renderToStaticMarkup(<StockLogsTab />);
    // Expect the root div to contain "w-full min-w-0" to prevent horizontal stretching
    expect(html).toContain('class="flex w-full min-w-0 flex-col gap-5"');
  });

  it("shows OUT verification badge and color in Stock Log without correction actions", () => {
    useInventoryLogsMock.mockReturnValue({
      data: {
        data: [
          {
            id: "log-out-1",
            productId: "product-1",
            type: "OUT",
            reason: "USAGE",
            quantity: 3,
            note: "Dipakai produksi",
            createdBy: "user-1",
            person: "Rina",
            createdAt: "2026-06-30T03:00:00.000Z",
            status: "APPROVED",
            approvedBy: "owner-1",
            approverName: "Owner",
            decidedAt: "2026-06-30T03:05:00.000Z",
            rejectionReason: null,
            verificationState: "MISMATCH",
            verification: { status: "MISMATCH" },
            latestCorrection: null,
            supplier: null,
            batchItem: null,
            product: {
              id: "product-1",
              name: "Kertas A4",
              sku: "A4-001",
              unit: "rim",
              stock: 12,
              imageUrl: null,
              category: { name: "Kertas", icon: null },
            },
          },
        ],
        pagination: { total: 1, pendingTotal: 0, page: 1, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
    });

    const html = renderToStaticMarkup(<StockLogsTab />);

    expect(html).toContain("Perlu Koreksi");
    expect(html).toContain("border-rose-200");
    expect(html).not.toContain(">Koreksi</button>");
  });

  it("groups an inbound receipt as an openable supplier bundle without PB number in the list", () => {
    const log = {
      id: "log-inbound-1",
      productId: "product-1",
      type: "IN" as const,
      reason: "RESTOCK",
      quantity: 4,
      note: "CV Kertas",
      createdBy: "owner-1",
      person: "Owner",
      createdAt: "2026-07-24T08:00:00.000Z",
      status: "APPROVED" as const,
      approvedBy: "owner-1",
      approverName: "Owner",
      decidedAt: "2026-07-24T08:00:00.000Z",
      rejectionReason: null,
      supplierId: "supplier-1",
      supplier: { id: "supplier-1", name: "CV Kertas" },
      product: {
        id: "product-1",
        name: "Kertas A4",
        sku: "A4-001",
        unit: "dus",
        stock: 14,
        imageUrl: null,
        category: { name: "Kertas", icon: null },
      },
      batchItem: {
        id: "batch-item-1",
        batchOperationId: "batch-inbound-1",
        action: "STOCK_IN",
        beforeSnapshot: { stock: 10 },
        afterSnapshot: { stock: 14 },
        batchOperation: {
          id: "batch-inbound-1",
          status: "COMMITTED" as const,
          type: "INBOUND_RECEIPT",
          createdBy: "owner-1",
          createdAt: "2026-07-24T08:00:00.000Z",
          summary: {
            supplierName: "CV Kertas",
            title: "CV Kertas",
            goodsPurchaseNumber: "PB-202607-001",
            totalCount: 1,
            approvedCount: 1,
          },
        },
      },
    };

    const grouped = groupBulkLogs([log]);
    expect(grouped).toEqual([
      expect.objectContaining({
        kind: "bundle",
        openable: true,
        batch: expect.objectContaining({ type: "INBOUND_RECEIPT" }),
      }),
    ]);

    useInventoryLogsMock.mockReturnValue({
      data: {
        data: [log],
        pagination: { total: 1, pendingTotal: 0, page: 1, totalPages: 1 },
      },
      isLoading: false,
      isError: false,
    });
    const html = renderToStaticMarkup(<StockLogsTab />);
    expect(html).toContain("CV Kertas");
    expect(html).not.toContain("PB-202607-001");
  });
});
