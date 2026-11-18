import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InboundReceiptReviewModal, receiptPricingInputForEdit } from "../InboundReceiptReviewModal";
import type { InboundReceiptListItem, InboundReceiptListLine } from "../../api/inventory-management-api";

vi.mock("@pos/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pos/ui")>();
  return {
    ...actual,
    Modal: ({ children, title }: { children: React.ReactNode; title: string }) => <div>{title}{children}</div>,
  };
});

const currentUnit = {
  productId: "binder-pak",
  unit: "Pak",
  unitMultiplierToBase: 12,
  costPrice: 25_992,
  price: 40_000,
  hargaAgen: 0,
  hargaDinas: null,
  pricingMode: "MANUAL" as const,
  pricingSourceProductId: "binder",
  pricingConfigRevision: 4,
};
const line: InboundReceiptListLine = {
  id: "line",
  updatedAt: "2026-11-16T09:49:32.494Z",
  productId: "binder-pak",
  goodsPurchaseItemId: "purchase-item",
  productNameSnapshot: "Binder Clips No 105",
  skuSnapshot: "BC-001-PAK",
  unitSnapshot: "Pak",
  expectedQuantity: 2,
  receivedQuantity: 2,
  costPriceSnapshot: 25_000,
  supplierCostPrice: 25_992,
  status: "RECEIVED",
  matchStatus: "MATCHED",
  reviewStatus: "APPROVED",
  note: null,
  pricingUnits: [currentUnit],
  pricingSnapshot: {
    version: 2,
    orderedUnitMultiplierToBase: 12,
    units: [{
      productId: "binder-pak",
      unit: "Pak",
      unitMultiplierToBase: 12,
      costPrice: 25_992,
      price: 4_000,
      hargaAgen: 0,
      hargaDinas: null,
      priceEdited: true,
      original: { costPrice: 25_000, price: 38_000, hargaAgen: 0, hargaDinas: null },
      pricingMode: "MANUAL",
      pricingSourceProductId: "binder",
      pricingConfigRevision: 3,
    }],
  },
};

describe("reviewing stale receipt prices", () => {
  it("shows the affected product and both the proposed and current price", () => {
    const receipt = {
      id: "receipt",
      goodsPurchaseId: "purchase",
      goodsPurchaseNumber: "PB-202611-002",
      status: "SUBMITTED",
      supplier: null,
      lines: [line],
    } as InboundReceiptListItem;
    const html = renderToStaticMarkup(
      <InboundReceiptReviewModal open receipt={receipt} canApprove canEdit canReject onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    expect(html).toContain("Binder Clips No 105");
    expect(html).toContain("Tinjau harga");
    expect(html).toContain("Rp 4.000");
    expect(html).toContain("Rp 40.000");
  });

  it("sends the displayed current price and rule revision with the user's proposal", () => {
    const payload = receiptPricingInputForEdit(line, [{
      productId: "binder-pak",
      costPrice: "25992",
      price: "4000",
      hargaAgen: "0",
      hargaDinas: "",
      priceEdited: true,
    }]);

    expect(payload).toMatchObject({
      version: 2,
      units: [{
        productId: "binder-pak",
        price: 4_000,
        baseline: {
          unit: "Pak",
          unitMultiplierToBase: 12,
          costPrice: 25_992,
          price: 40_000,
          hargaAgen: 0,
          hargaDinas: null,
          pricingMode: "MANUAL",
          pricingSourceProductId: "binder",
          pricingConfigRevision: 4,
        },
      }],
    });
  });

  it("does not ask for another review when the original prices and rules still match", () => {
    const unchangedLine = {
      ...line,
      pricingUnits: [{ ...currentUnit, costPrice: 25_000, price: 38_000, pricingConfigRevision: 3 }],
    };
    const receipt = {
      id: "receipt", goodsPurchaseId: "purchase", status: "SUBMITTED",
      supplier: null, lines: [unchangedLine],
    } as InboundReceiptListItem;
    const html = renderToStaticMarkup(
      <InboundReceiptReviewModal open receipt={receipt} canApprove canEdit canReject onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    expect(html).not.toContain("Tinjau harga");
  });

  it("flags a revision change even when the original product prices match", () => {
    const receipt = {
      id: "receipt", goodsPurchaseId: "purchase", status: "SUBMITTED", supplier: null,
      lines: [{ ...line, pricingUnits: [{ ...currentUnit, costPrice: 25_000, price: 38_000 }] }],
    } as InboundReceiptListItem;
    const html = renderToStaticMarkup(
      <InboundReceiptReviewModal open receipt={receipt} canApprove canEdit canReject onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    expect(html).toContain("Tinjau harga");
    expect(html).toContain("Rp 38.000");
  });

  it("explains that a changed price is a warning and the receipt can still be approved", () => {
    const receipt = {
      id: "receipt", goodsPurchaseId: "purchase", status: "SUBMITTED", supplier: null,
      lines: [{ ...line, reviewStatus: "PENDING" }],
    } as InboundReceiptListItem;
    const html = renderToStaticMarkup(
      <InboundReceiptReviewModal open receipt={receipt} canApprove canEdit canReject onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    expect(html).toContain("Penerimaan tetap dapat disetujui");
    expect(html).toContain("harga produk terkini dipertahankan");
    expect(html).toContain("Setujui Item");
  });

  it("does not promise approval when a unit conversion has changed", () => {
    const receipt = {
      id: "receipt", goodsPurchaseId: "purchase", status: "SUBMITTED", supplier: null,
      lines: [{ ...line, reviewStatus: "PENDING", pricingUnits: [{ ...currentUnit, unitMultiplierToBase: 24 }] }],
    } as InboundReceiptListItem;
    const html = renderToStaticMarkup(
      <InboundReceiptReviewModal open receipt={receipt} canApprove canEdit canReject onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    expect(html).toContain("Satuan atau konversi perlu diperiksa sebelum penerimaan disetujui");
    expect(html).not.toContain("Penerimaan tetap dapat disetujui");
  });

  it("shows retained prices in the history of an approved receipt", () => {
    const receipt = {
      id: "receipt", goodsPurchaseId: "purchase", status: "APPROVED", supplier: null,
      pricingWarningProductIds: ["binder-pak"], lines: [line],
    } as InboundReceiptListItem;
    const html = renderToStaticMarkup(
      <InboundReceiptReviewModal open receipt={receipt} canApprove={false} canEdit={false} canReject={false} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );

    expect(html).toContain("Harga produk dipertahankan saat penerimaan disetujui");
  });
});
