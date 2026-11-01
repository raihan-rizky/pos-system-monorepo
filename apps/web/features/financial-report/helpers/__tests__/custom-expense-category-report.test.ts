import { describe, expect, it } from "vitest";
import { buildMonthlyPeriod, buildMonthlyReport } from "../monthly-report-core";
import { buildMonthlyWorkbook } from "../monthly-workbook";
import { buildReportRows } from "../journal-core";

describe("kategori pengeluaran khusus pada laporan", () => {
  it("menampilkan nama kategori manual di sheet RP tanpa mengubah nominal", () => {
    const period = buildMonthlyPeriod(2026, 9, new Date("2026-10-21T00:00:00Z"));
    const report = buildMonthlyReport({ year: 2026, month: 9, period, transactions: [], manualReceivables: [], expenses: [{
      id: "expense-1", occurredAt: new Date("2026-09-02T03:00:00Z"), category: "OTHER",
      customCategory: { name: "Kemasan" }, amount: 100, changeAmount: 20, description: "Kantong",
    }] });
    expect(report.expenses[0]).toMatchObject({ amount: 80, categoryName: "Kemasan" });
    const rp = buildMonthlyWorkbook(report).Sheets["RP SEPTEMBER"];
    expect(rp.G7.v).toBe("Kemasan");
    expect(rp.F7.v).toBe(80);
  });

  it("memakai nama kategori khusus dalam jurnal", () => {
    const rows = buildReportRows([], [{ id: "expense-1", occurredAt: new Date("2026-09-02T03:00:00Z"), applicantName: "Budi", category: "OTHER", customCategoryName: "Kemasan", description: null, amount: 100, changeAmount: 20 }]);
    expect(rows[0]).toMatchObject({ categories: "Kemasan", products: "Kemasan", amount: -80 });
  });
});
