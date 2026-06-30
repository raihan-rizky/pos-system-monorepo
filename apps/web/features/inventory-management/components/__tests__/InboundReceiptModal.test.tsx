import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InboundReceiptModal } from "../InboundReceiptModal";

vi.mock("@pos/ui", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    Modal: ({ children, title }: any) => (
      <div data-testid="modal-mock">
        {title}
        {children}
      </div>
    ),
  };
});

const fetchReceivingQueueMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/inventory-management-api", () => ({
  createInboundReceipt: vi.fn(),
  fetchReceivingQueue: fetchReceivingQueueMock,
}));

const initialSummary = {
  urgentCount: 0,
  counts: {
    pendingStockRequests: 0,
    unverifiedOutLogs: 0,
    submittedInboundReceipts: 0,
    weeklyProofMissing: false,
    dailyMatchingIncomplete: false,
    damagedReportsPending: 0,
    needsRevisionReceipts: 0,
    rejectedOwnRequests: 0,
  },
  period: { dateKey: "2026-06-25", weekKey: "2026-W26" },
  chartData: {
    inboundOutbound: [],
    health: { accuracy: 100, availability: 100, fulfillment: 100 },
  },
};

describe("InboundReceiptModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads existing Daftar Belanja invoices when no receiving queue prop is provided", () => {
    fetchReceivingQueueMock.mockResolvedValueOnce({ items: [] });

    renderToStaticMarkup(
      <InboundReceiptModal
        open
        onClose={vi.fn()}
        initialSummary={initialSummary}
        onSuccess={vi.fn()}
      />,
    );

    expect(fetchReceivingQueueMock).toHaveBeenCalledWith({ take: 100 });
  });

  it("selects an existing Daftar Belanja invoice instead of manual IDs", () => {
    const html = renderToStaticMarkup(
      <InboundReceiptModal
        open
        onClose={vi.fn()}
        initialSummary={initialSummary}
        onSuccess={vi.fn()}
        receivingQueue={{
          items: [
            {
              shoppingRequestId: "shopping-1",
              shoppingRequestNumber: "DPB-202606-001",
              supplierName: "Supplier A",
              itemId: "item-1",
              productId: "product-1",
              productName: "Produk A",
              unit: "pcs",
              expectedQuantity: 10,
              approvedReceivedQuantity: 2,
              submittedReservedQuantity: 3,
              remainingQuantity: 5,
              hasActiveReceipt: false,
              activeReceiptCount: 0,
              activeReceiptStatuses: [],
              isFullyReceived: false,
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Pilih Invoice Daftar Belanja");
    expect(html).toContain("name=\"inboundShoppingRequestId\"");
    expect(html).toContain("DPB-202606-001");
    expect(html).toContain("Produk A");
    expect(html).toContain("name=\"inboundLines.item-1.expectedQuantity\"");
    expect(html).toContain("name=\"inboundLines.item-1.receivedQuantity\"");
    expect(html).not.toContain("name=\"inboundSupplierId\"");
    expect(html).not.toContain("name=\"inboundProductId\"");
  });

  it("shows active receipt badges and completion state in a custom invoice picker", () => {
    const html = renderToStaticMarkup(
      <InboundReceiptModal
        open
        onClose={vi.fn()}
        initialSummary={initialSummary}
        onSuccess={vi.fn()}
        receivingQueue={{
          items: [
            {
              shoppingRequestId: "shopping-1",
              shoppingRequestNumber: "DPB-202606-001",
              supplierName: "Supplier A",
              itemId: "item-1",
              productId: "product-1",
              productName: "Produk A",
              unit: "pcs",
              expectedQuantity: 10,
              approvedReceivedQuantity: 10,
              submittedReservedQuantity: 0,
              remainingQuantity: 0,
              hasActiveReceipt: true,
              activeReceiptCount: 1,
              activeReceiptStatuses: ["APPROVED"],
              isFullyReceived: true,
            },
            {
              shoppingRequestId: "shopping-2",
              shoppingRequestNumber: "DPB-202606-002",
              supplierName: "Supplier B",
              itemId: "item-2",
              productId: "product-2",
              productName: "Produk B",
              unit: "pcs",
              expectedQuantity: 7,
              approvedReceivedQuantity: 0,
              submittedReservedQuantity: 0,
              remainingQuantity: 7,
              hasActiveReceipt: false,
              activeReceiptCount: 0,
              activeReceiptStatuses: [],
              isFullyReceived: false,
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Sudah dibuat");
    expect(html).toContain("Sudah lengkap");
    expect(html).toContain("DPB-202606-002");
    expect(html).not.toContain("<select name=\"inboundShoppingRequestId\"");
  });
});
