import { describe, expect, it } from "vitest";

import { buildFinancialExportAdvice, type ExportInput } from "../journal-export";

function reportInput(footer: ExportInput["footer"]): ExportInput {
  return {
    period: "30d",
    from: "2026-06-23",
    to: "2026-07-22",
    rows: [],
    footer,
  };
}

describe("buildFinancialExportAdvice", () => {
  it("turns the exported financial totals into actionable advice", () => {
    const advice = buildFinancialExportAdvice(reportInput({
      totalPemasukan: 10_000_000,
      totalPengeluaran: 6_000_000,
      grandTotal: 4_000_000,
      byMethod: { CASH: 7_000_000, TRANSFER: 3_000_000, QRIS: 0, DEBIT: 0, CREDIT: 0 },
    }));

    expect(advice).toEqual(expect.arrayContaining([
      expect.stringContaining("60%"),
      expect.stringContaining("positif"),
      expect.stringContaining("CASH"),
    ]));
  });

  it("does not invent ratios when the report has no income", () => {
    const advice = buildFinancialExportAdvice(reportInput({
      totalPemasukan: 0,
      totalPengeluaran: 0,
      grandTotal: 0,
      byMethod: { CASH: 0, TRANSFER: 0, QRIS: 0, DEBIT: 0, CREDIT: 0 },
    }));

    expect(advice).toEqual([expect.stringContaining("Belum ada pemasukan")]);
  });
});
