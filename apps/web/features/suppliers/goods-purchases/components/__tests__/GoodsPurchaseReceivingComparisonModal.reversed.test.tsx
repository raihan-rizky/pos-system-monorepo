import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoodsPurchaseReceivingComparisonContent } from "../GoodsPurchaseReceivingComparisonModal";

describe("perbandingan penerimaan yang stoknya dibalik", () => {
  it("menandai penerimaan yang dibalik dan menjelaskan jumlah historis", () => {
    const comparison = {
      goodsPurchaseId: "gp-1", goodsPurchaseNumber: "PB-1", supplierName: "Supplier", fulfillmentStatus: "RECEIVED" as const,
      items: [], receipts: [
        { id: "r1", createdAt: "2026-11-01T00:00:00Z", status: "APPROVED" as const, stockReversed: true, approvedAt: null, approverName: null, lines: [] },
        { id: "r2", createdAt: "2026-11-02T00:00:00Z", status: "APPROVED" as const, stockReversed: false, approvedAt: null, approverName: null, lines: [] },
      ],
    };
    const html = renderToStaticMarkup(<GoodsPurchaseReceivingComparisonContent comparison={comparison} />);
    expect(html.match(/Stok sudah dibalik/g)).toHaveLength(1);
    expect(html).toContain("Jumlah diterima menunjukkan riwayat penerimaan");
  });
});
