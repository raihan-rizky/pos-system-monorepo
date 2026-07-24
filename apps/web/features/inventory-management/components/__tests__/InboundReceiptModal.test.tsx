import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as inboundReceiptModalModule from "../InboundReceiptModal";
import { InboundReceiptModal } from "../InboundReceiptModal";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void) => effect(),
  };
});

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

const createInboundReceiptMock = vi.hoisted(() => vi.fn());
const fetchReceivingQueueMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/inventory-management-api", () => ({
  createInboundReceipt: createInboundReceiptMock,
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
  period: { dateKey: "2026-07-24", weekKey: "2026-W30" },
  chartData: {
    inboundOutbound: [],
    health: { accuracy: 100, availability: 100, fulfillment: 100 },
  },
};

const receivingQueue = {
  purchases: [
    {
      id: "gp-1",
      number: "PB-202607-001",
      supplierId: "supplier-1",
      supplierName: "CV Kertas",
      fulfillmentStatus: "NOT_RECEIVED" as const,
      pendingReceiptCount: 1,
      items: [
        {
          goodsPurchaseItemId: "gpi-1",
          productId: "product-1",
          productName: "Kertas A4",
          sku: "KRT-A4",
          unit: "rim",
          orderedQuantity: 10,
          approvedReceivedQuantity: 2,
          pendingReservedQuantity: 3,
          availableQuantity: 5,
        },
      ],
    },
    {
      id: "gp-2",
      number: "PB-202607-002",
      supplierId: "supplier-2",
      supplierName: "CV Tinta",
      fulfillmentStatus: "PARTIALLY_RECEIVED" as const,
      pendingReceiptCount: 0,
      items: [
        {
          goodsPurchaseItemId: "gpi-2",
          productId: "product-2",
          productName: "Tinta Hitam",
          sku: "TNT-H",
          unit: "botol",
          orderedQuantity: 8,
          approvedReceivedQuantity: 2,
          pendingReservedQuantity: 0,
          availableQuantity: 6,
        },
      ],
    },
  ],
  // Legacy rows intentionally keep the RED render meaningful until the old
  // Daftar Belanja implementation is replaced.
  items: [
    {
      shoppingRequestId: "gp-1",
      shoppingRequestNumber: "DPB-202607-001",
      supplierName: "CV Kertas",
      itemId: "gpi-1",
      productId: "product-1",
      productName: "Kertas A4",
      unit: "rim",
      expectedQuantity: 10,
      approvedReceivedQuantity: 2,
      submittedReservedQuantity: 3,
      remainingQuantity: 5,
      hasActiveReceipt: true,
      activeReceiptCount: 1,
      activeReceiptStatuses: ["SUBMITTED" as const],
      isFullyReceived: false,
    },
    {
      shoppingRequestId: "gp-2",
      shoppingRequestNumber: "DPB-202607-002",
      supplierName: "CV Tinta",
      itemId: "gpi-2",
      productId: "product-2",
      productName: "Tinta Hitam",
      unit: "botol",
      expectedQuantity: 8,
      approvedReceivedQuantity: 2,
      submittedReservedQuantity: 0,
      remainingQuantity: 6,
      hasActiveReceipt: false,
      activeReceiptCount: 0,
      activeReceiptStatuses: [],
      isFullyReceived: false,
    },
  ],
};

function synchronouslyLoadedQueue() {
  return {
    then(onFulfilled: (queue: typeof receivingQueue) => unknown) {
      onFulfilled(receivingQueue);
      return {
        catch() {
          return undefined;
        },
      };
    },
  };
}

function renderModal(initialGoodsPurchaseId?: string) {
  fetchReceivingQueueMock.mockReturnValue(
    synchronouslyLoadedQueue() as unknown as Promise<typeof receivingQueue>,
  );

  return renderToStaticMarkup(
    React.createElement(InboundReceiptModal as React.ComponentType<any>, {
      open: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
      initialGoodsPurchaseId,
      initialSummary,
    }),
  );
}

describe("InboundReceiptModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Goods Purchase receiving flow without legacy invoice fields", () => {
    const html = renderModal();

    expect(html).toContain("Pilih Pembelian Barang");
    expect(html).toContain("PB-202607-001");
    expect(html).toContain("CV Kertas");
    expect(html).toContain("Kertas A4");
    expect(html).toContain("Ada 1 penerimaan menunggu persetujuan");
    expect(html).toContain("Sesuai");
    expect(html).toContain("Tidak Sesuai");
    expect(html).toContain("Jumlah Diterima");
    expect(html).toContain('name="inboundGoodsPurchaseId"');
    expect(html).not.toContain("Invoice Daftar Belanja");
    expect(html).not.toContain("Status Line");
    expect(html).not.toContain("Qty Ekspektasi");
  });

  it("preselects gp-2 after the asynchronous receiving queue loads", async () => {
    const loadedQueue = await Promise.resolve(receivingQueue);
    const resolveSelection = (
      inboundReceiptModalModule as typeof inboundReceiptModalModule & {
        resolveInboundGoodsPurchaseSelection?: (input: {
          purchases: typeof receivingQueue.purchases;
          currentGoodsPurchaseId: string;
          initialGoodsPurchaseId?: string | null;
        }) => string;
      }
    ).resolveInboundGoodsPurchaseSelection;

    expect(resolveSelection).toBeTypeOf("function");
    if (!resolveSelection) return;

    expect(
      resolveSelection({
        purchases: loadedQueue.purchases,
        currentGoodsPurchaseId: "",
        initialGoodsPurchaseId: "gp-2",
      }),
    ).toBe("gp-2");

    const html = renderModal("gp-2");
    expect(html).toContain('name="inboundGoodsPurchaseId"');
    expect(html).toContain('value="gp-2"');
    expect(html).toMatch(
      /data-goods-purchase-id="gp-2"[^>]*aria-pressed="true"/,
    );
  });

  it("validates finite received quantities, bounds, and conditional notes", () => {
    const isLineValid = (
      inboundReceiptModalModule as typeof inboundReceiptModalModule & {
        isInboundReceiptLineValid?: (input: {
          availableQuantity: number;
          line: {
            matchStatus: "MATCHED" | "MISMATCHED";
            receivedQuantity: string;
            note: string;
          };
        }) => boolean;
      }
    ).isInboundReceiptLineValid;

    expect(isLineValid).toBeTypeOf("function");
    if (!isLineValid) return;

    const line = {
      matchStatus: "MATCHED" as const,
      receivedQuantity: "",
      note: "",
    };
    expect(isLineValid({ availableQuantity: 5, line })).toBe(false);
    expect(
      isLineValid({
        availableQuantity: 5,
        line: { ...line, receivedQuantity: "Infinity" },
      }),
    ).toBe(false);
    expect(
      isLineValid({
        availableQuantity: 5,
        line: { ...line, receivedQuantity: "-1" },
      }),
    ).toBe(false);
    expect(
      isLineValid({
        availableQuantity: 5,
        line: { ...line, receivedQuantity: "6" },
      }),
    ).toBe(false);
    expect(
      isLineValid({
        availableQuantity: 5,
        line: { ...line, receivedQuantity: "4" },
      }),
    ).toBe(false);
    expect(
      isLineValid({
        availableQuantity: 5,
        line: {
          ...line,
          matchStatus: "MISMATCHED",
          receivedQuantity: "4",
          note: "Kurang 1",
        },
      }),
    ).toBe(true);
    expect(
      isLineValid({
        availableQuantity: 5,
        line: { ...line, receivedQuantity: "5" },
      }),
    ).toBe(true);
  });
});
