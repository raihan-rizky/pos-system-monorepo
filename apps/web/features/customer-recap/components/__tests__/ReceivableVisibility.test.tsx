import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { RecapSummaryCards } from "../RecapSummaryCards";
import { RecapByTypeChart } from "../RecapByTypeChart";
import type { CustomerRecapData } from "../../types/customer-recap";
import { RecapTrendChart } from "../RecapTrendChart";

vi.mock("@/features/chart-ai-insight/ChartAiInsightButton", () => ({ ChartAiInsightButton: () => null }));

it("does not display piutang cards or fabricated zero values when metrics are redacted", () => {
  const summary = { newCustomers: 1, returningCustomers: 2, churnedCustomers: 0, avgOrderValue: 125000, orderFrequency: 1, repeatPurchaseRate: 0.5 } as CustomerRecapData["summary"];
  const html = renderToStaticMarkup(<RecapSummaryCards summary={summary} />);
  expect(html).toContain("Pelanggan Baru");
  expect(html).not.toContain("Piutang Total");
  expect(html).not.toContain("Piutang Terbayar");
  expect(html).not.toContain("NaN");
});

it("labels a customer-type chart without piutang when the values are redacted", () => {
  const rows = [{ type: "UMUM", customerCount: 1, revenue: 125000 }] as CustomerRecapData["byType"];
  const html = renderToStaticMarkup(<RecapByTypeChart rows={rows} />);
  expect(html).toContain("Omzet per tipe");
  expect(html).not.toContain("Omzet dan piutang per tipe");
});
it("does not render a debt trend from redacted detail points",()=>{
  const html=renderToStaticMarkup(<RecapTrendChart mode="detail" trend={{granularity:"daily",points:[{bucketKey:"2026-11-11",label:"11 Nov",spent:100,orderCount:1}]}}/>);
  expect(html).not.toContain("piutang");expect(html).not.toContain("pelunasan");
});
