import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerRecapPanel } from "../CustomerRecapPanel";

const state = vi.hoisted(() => ({
  summary: { totalSpent: 0, totalOrders: 0, avgOrderValue: 0, debtRemaining: 999000, debtPaidInPeriod: 45000, debtUnpaidInPeriod: 110000, debtPaidOffInPeriod: 70000, averagePaymentDays: 2.5 as number | null },
}));
vi.mock("../../hooks/useCustomerRecap", () => ({ useCustomerDetailRecap: () => ({ data: { summary: state.summary, trend: { granularity: "daily", points: [] }, topProducts: [] } }) }));

describe("CustomerRecapPanel KPI cards", () => {
  beforeEach(() => { state.summary.averagePaymentDays = 2.5; });
  const render = () => renderToStaticMarkup(<CustomerRecapPanel customerId="customer-1" range={{ dateFrom: "2026-05-01", dateTo: "2026-05-03" }} />);

  it("replaces the graph with the three period KPIs and retains the range and products", () => {
    const html = render();
    for (const text of ["Piutang Belum Lunas", "Piutang Dilunasi", "Rata-rata Waktu Pelunasan", "110.000", "70.000", "2,5 hari", "7 Hari", "14 Hari", "30 Hari", "Produk Teratas"]) expect(html).toContain(text);
    expect(html).not.toContain("Tren Periode");
    expect(html).not.toContain("999.000");
    expect(html).not.toContain("45.000");
  });

  it("shows no-settlement copy without pretending the average is zero days", () => {
    state.summary.averagePaymentDays = null;
    const html = render();
    expect(html).toContain("Belum ada pelunasan");
    expect(html).not.toContain("0 hari");
  });

  it("shows zero days for a real same-day settlement", () => {
    state.summary.averagePaymentDays = 0;
    expect(render()).toContain("0 hari");
  });
});
