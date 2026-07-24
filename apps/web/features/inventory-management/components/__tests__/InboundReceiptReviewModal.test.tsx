import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  InboundReceiptReviewModal,
  getInboundReceiptLineConflict,
} from "../InboundReceiptReviewModal";

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

const receipt = {
  id: "receipt-1",
  goodsPurchaseId: "gp-1",
  goodsPurchaseNumber: "PB-202607-001",
  status: "SUBMITTED" as const,
  createdAt: "2026-07-24T08:00:00.000Z",
  submittedBy: "inventory-1",
  submittedAt: "2026-07-24T08:00:00.000Z",
  approvedAt: null,
  rejectionReason: null,
  revisionReason: null,
  supplier: { name: "CV Kertas" },
  note: null,
  lines: [
    {
      id: "line-1",
      productId: "product-1",
      goodsPurchaseItemId: "gpi-1",
      productNameSnapshot: "Kertas A4",
      skuSnapshot: "A4-001",
      unitSnapshot: "dus",
      expectedQuantity: 10,
      receivedQuantity: 8,
      status: "PARTIAL",
      matchStatus: "MATCHED" as const,
      reviewStatus: "PENDING" as const,
      note: "Supplier hanya ready 8 dus",
    },
    {
      id: "line-2",
      productId: "product-2",
      goodsPurchaseItemId: "gpi-2",
      productNameSnapshot: "Tinta",
      skuSnapshot: "INK-001",
      unitSnapshot: "box",
      expectedQuantity: 5,
      receivedQuantity: 4,
      status: "PARTIAL",
      matchStatus: "MISMATCHED" as const,
      reviewStatus: "APPROVED" as const,
      note: "Kurang 1 box",
    },
  ],
};

const comparison = {
  goodsPurchaseId: "gp-1",
  goodsPurchaseNumber: "PB-202607-001",
  supplierName: "CV Kertas",
  fulfillmentStatus: "NOT_RECEIVED" as const,
  items: [
    {
      goodsPurchaseItemId: "gpi-1",
      productName: "Kertas A4",
      sku: "A4-001",
      unit: "dus",
      orderedQuantity: 10,
      approvedReceivedQuantity: 0,
      pendingReservedQuantity: 12,
      remainingQuantity: 10,
    },
    {
      goodsPurchaseItemId: "gpi-2",
      productName: "Tinta",
      sku: "INK-001",
      unit: "box",
      orderedQuantity: 5,
      approvedReceivedQuantity: 0,
      pendingReservedQuantity: 4,
      remainingQuantity: 5,
    },
  ],
  receipts: [],
};

describe("InboundReceiptReviewModal", () => {
  it("renders per-item approval, edit, remove, match, and conflict controls", () => {
    const html = renderToStaticMarkup(
      <InboundReceiptReviewModal
        open
        receipt={receipt}
        comparison={comparison}
        canApprove
        canEdit
        canReject
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(html).toContain("Belum Ada Aksi");
    expect(html).toContain("Disetujui");
    expect(html).toContain("Setujui Item");
    expect(html).toContain("Edit");
    expect(html).toContain("Hapus");
    expect(html).toContain("Sesuai");
    expect(html).toContain("Tidak Sesuai");
    expect(html).toContain("Konflik Qty");
    expect(html).toContain("Alasan penolakan");
    expect(html).not.toContain("Minta Revisi");
  });

  it("detects quantities reserved by another pending receipt", () => {
    expect(
      getInboundReceiptLineConflict({
        line: receipt.lines[0],
        comparison,
      }),
    ).toEqual({
      conflict: true,
      otherPendingQuantity: 4,
      availableForCurrentReceipt: 6,
    });
  });
});
