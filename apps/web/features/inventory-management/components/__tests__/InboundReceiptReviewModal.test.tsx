import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  InboundReceiptReviewModal,
  getInboundReceiptLineConflict,
  hasActiveSharedPricing,
  receiptPricingUnitsForEdit,
  receiptPricingInputForEdit,
} from "../InboundReceiptReviewModal";
import type { InboundReceiptListLine } from "../../api/inventory-management-api";

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
      supplierCostPrice: 6_500,
      costPriceSnapshot: 6_500,
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
      supplierCostPrice: 8_250,
      costPriceSnapshot: 8_250,
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
  it("keeps an older single-unit snapshot single-unit when edited", () => {
    const units = [
      { productId: "product-1", unit: "dus", unitMultiplierToBase: 12, costPrice: 1200, price: 1500, hargaAgen: 1400, hargaDinas: 1300 },
      { productId: "pcs", unit: "pcs", unitMultiplierToBase: 1, costPrice: 100, price: 125, hargaAgen: 120, hargaDinas: 110 },
    ];
    const line = { ...receipt.lines[0], pricingUnits: units, pricingSnapshot: { version: 1, ...units[1], orderedUnitMultiplierToBase: 12 } } as InboundReceiptListLine;
    const drafts = units.map((unit) => ({ productId: unit.productId, costPrice: String(unit.costPrice), price: String(unit.price), hargaAgen: String(unit.hargaAgen), hargaDinas: String(unit.hargaDinas) }));
    expect(receiptPricingUnitsForEdit(line).map((unit) => unit.productId)).toEqual(["pcs"]);
    expect(receiptPricingInputForEdit(line, drafts)).toEqual({ productId: "pcs", costPrice: 100, price: 125, hargaAgen: 120, hargaDinas: 110 });
    const noUnit = { ...line, pricingSnapshot: { ...line.pricingSnapshot!, version: 1 as const, productId: null } } as InboundReceiptListLine;
    expect(receiptPricingUnitsForEdit(noUnit).map((unit) => unit.productId)).toEqual(["product-1"]);
  });

  it("requires confirmation before saving prices that can affect another active line in the same group", () => {
    const line = { ...receipt.lines[0], pricingSnapshot: { version: 2 }, pricingUnits: [{ productId: "product-1" }, { productId: "product-2" }] } as unknown as InboundReceiptListLine;
    const sibling = { ...receipt.lines[1], matchStatus: "MATCHED", receivedQuantity: 4, pricingSnapshot: { version: 2 } } as unknown as InboundReceiptListLine;
    const input = { line, lines: [line, sibling], matchStatus: "MATCHED" as const, receivedQuantity: 1 };

    expect(hasActiveSharedPricing(input)).toBe(true);
    expect(hasActiveSharedPricing({ ...input, receivedQuantity: 0 })).toBe(false);
    expect(hasActiveSharedPricing({ ...input, matchStatus: "MISMATCHED" })).toBe(false);
    expect(hasActiveSharedPricing({ ...input, lines: [line, { ...sibling, receivedQuantity: 0 }] })).toBe(false);
    expect(hasActiveSharedPricing({ ...input, lines: [line, { ...sibling, productId: "another-group" }] })).toBe(false);
  });

  it("shows every saved unit on receipt review", () => {
    const unit = { productId: "product-1", unit: "dus", unitMultiplierToBase: 12, costPrice: 1200, price: 1500, hargaAgen: null, hargaDinas: null,
      priceEdited: false, original: { costPrice: 1200, price: 1500, hargaAgen: null, hargaDinas: null }, pricingMode: "MANUAL" as const, pricingSourceProductId: null, pricingConfigRevision: null };
    const multiUnitReceipt = { ...receipt, lines: [{ ...receipt.lines[0], pricingSnapshot: { version: 2 as const, orderedUnitMultiplierToBase: 12,
      units: [unit, { ...unit, productId: "pcs", unit: "pcs", unitMultiplierToBase: 1, costPrice: 100, price: 125 }] } }] };
    const html = renderToStaticMarkup(<InboundReceiptReviewModal open receipt={multiUnitReceipt} comparison={comparison} canApprove canEdit canReject onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(html).toContain("Satuan harga: ");
    expect(html).toContain("dus");
    expect(html).toContain("pcs");
    expect(html).toContain("Rp 125");
  });

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
    expect(html).toContain("HPP Unit");
    expect(html).toContain("Rp 6.500");
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
