import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InboundReceiptStockBundleContent } from "../InboundReceiptStockBundleModal";

vi.mock("@pos/ui", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    Modal: ({ children, title }: any) => <div>{title}{children}</div>,
  };
});

describe("InboundReceiptStockBundleModal", () => {
  it("renders supplier, PB number, and canonical plus variant stock impacts", () => {
    const html = renderToStaticMarkup(
      <InboundReceiptStockBundleContent
        batch={{
          id: "batch-1",
          status: "COMMITTED",
          type: "INBOUND_RECEIPT",
          createdBy: "owner-1",
          createdAt: "2026-07-24T08:00:00.000Z",
          summary: {
            supplierName: "CV Kertas",
            goodsPurchaseNumber: "PB-202607-001",
          },
          items: [
            {
              id: "canonical-1",
              inventoryLogId: "log-1",
              sku: "A4-DUS",
              product: {
                id: "product-1",
                name: "Kertas A4",
                sku: "A4-DUS",
                stock: 14,
              },
              beforeSnapshot: {
                stock: 10,
                unit: "Dus",
                inboundReceiptImpact: { kind: "CANONICAL" },
              },
              afterSnapshot: {
                stock: 14,
                unit: "Dus",
                inboundReceiptImpact: { kind: "CANONICAL" },
              },
              inventoryLog: null,
            },
            {
              id: "variant-1",
              inventoryLogId: null,
              sku: "A4-BOX",
              product: {
                id: "product-2",
                name: "Kertas A4 Box",
                sku: "A4-BOX",
                stock: 7,
              },
              beforeSnapshot: {
                stock: 5,
                unit: "Box",
                inboundReceiptImpact: { kind: "VARIANT" },
              },
              afterSnapshot: {
                stock: 7,
                unit: "Box",
                inboundReceiptImpact: { kind: "VARIANT" },
              },
              inventoryLog: null,
            },
            {
              id: "variant-2",
              inventoryLogId: null,
              sku: "A4-PCS",
              product: {
                id: "product-3",
                name: "Kertas A4 Pcs",
                sku: "A4-PCS",
                stock: 140,
              },
              beforeSnapshot: {
                stock: 100,
                unit: "Pcs",
                inboundReceiptImpact: { kind: "VARIANT" },
              },
              afterSnapshot: {
                stock: 140,
                unit: "Pcs",
                inboundReceiptImpact: { kind: "VARIANT" },
              },
              inventoryLog: null,
            },
          ],
        }}
      />,
    );

    expect(html).toContain("CV Kertas");
    expect(html).toContain("PB-202607-001");
    expect(html).toContain("Sebelum");
    expect(html).toContain("Sesudah");
    expect(html).toContain("Perubahan");
    expect(html).toContain("Dus");
    expect(html).toContain("Box");
    expect(html).toContain("Pcs");
    expect(html).toContain("Produk Diterima");
    expect(html).toContain("Dampak Varian Stok Bersama");
  });
});
