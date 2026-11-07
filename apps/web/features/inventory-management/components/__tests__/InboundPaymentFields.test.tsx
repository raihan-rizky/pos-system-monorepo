import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InboundPaymentFields, InboundPaymentSummary } from "../InboundPaymentFields";

const payments = [
  { method: "GIRO" as const, amount: 700_000, dueDate: "2026-11-14", note: "7 hari" },
  { method: "GIRO" as const, amount: 1_300_000, dueDate: "2026-12-07", note: "30 hari" },
];
describe("rincian pembayaran penerimaan", () => {
  it("allows a retained zero row only in correction mode", () => {
    const html = renderToStaticMarkup(<InboundPaymentFields payments={[{ ...payments[0], amount: 0 }]} totalAmount={0} allowZeroAmounts onChange={vi.fn()} />);
    expect(html).toContain('min="0"');
    expect(html).toContain('value="0"');
  });
  it("renders two separately labelled giro amounts and dates and their exact total", () => {
    const html = renderToStaticMarkup(<InboundPaymentFields payments={payments} totalAmount={2_000_000} onChange={vi.fn()} />);
    expect(html).toContain('name="payments.0.amount"');
    expect(html).toContain('name="payments.1.amount"');
    expect(html).toContain('value="2026-11-14"');
    expect(html).toContain('value="2026-12-07"');
    expect(html).toContain("Tambah Giro");
    expect(html).toContain("Rp 2.000.000");
    expect(html).toContain("Sisa alokasi");
  });
  it("shows every giro in a read-only summary", () => {
    const html = renderToStaticMarkup(<InboundPaymentSummary payments={payments} />);
    expect(html).toContain("Giro 1");
    expect(html).toContain("Giro 2");
    expect(html).toContain("14/11/2026");
    expect(html).toContain("07/12/2026");
    expect(html).toContain("Rp 700.000");
  });
});
