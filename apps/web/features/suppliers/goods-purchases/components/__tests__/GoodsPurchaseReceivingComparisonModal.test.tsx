import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GoodsPurchaseReceivingComparisonContent } from "../GoodsPurchaseReceivingComparisonModal";

vi.mock("@pos/ui", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    Modal: ({ children, title }: any) => <div>{title}{children}</div>,
  };
});

describe("GoodsPurchaseReceivingComparisonModal", () => {
  it("renders cumulative ordered, approved, pending, and remaining quantities plus receipt batches", () => {
    const html = renderToStaticMarkup(
      <GoodsPurchaseReceivingComparisonContent
        comparison={{
          goodsPurchaseId: "gp-1",
          goodsPurchaseNumber: "PB-202607-001",
          supplierName: "CV Kertas",
          fulfillmentStatus: "PARTIALLY_RECEIVED",
          items: [
            {
              goodsPurchaseItemId: "gpi-1",
              productName: "Kertas A4",
              sku: "A4-001",
              unit: "dus",
              orderedQuantity: 50,
              approvedReceivedQuantity: 40,
              pendingReservedQuantity: 5,
              remainingQuantity: 10,
            },
          ],
          receipts: [
            {
              id: "receipt-1",
              createdAt: "2026-07-24T08:00:00.000Z",
              status: "APPROVED",
              approvedAt: "2026-07-24T09:00:00.000Z",
              approverName: "Owner",
              lines: [
                {
                  goodsPurchaseItemId: "gpi-1",
                  receivedQuantity: 40,
                  matchStatus: "MATCHED",
                  note: "Supplier ready 40",
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(html).toContain("CV Kertas");
    expect(html).toContain("PB-202607-001");
    expect(html).toContain("Dipesan");
    expect(html).toContain("Diterima");
    expect(html).toContain("Pending");
    expect(html).toContain("Sisa");
    expect(html).toContain("Riwayat per Penerimaan Barang");
    expect(html).toContain("Supplier ready 40");
  });
});
