import { expect, it } from "vitest";
import { buildFinancialReport } from "../report-core";

it("includes manual income by category and payment without treating its unknown cost as profit", () => {
  const report = buildFinancialReport({
    dateFrom: "2026-09-02", dateTo: "2026-09-02", transactions: [], shifts: [],
    manualIncome: [
      { id: "one", occurredAt: new Date("2026-09-02T03:00:00Z"), category: "ATK", amount: 100.01,
        payments: [{ method: "CASH", amount: 40 }, { method: "TRANSFER", amount: 60.01 }] },
      { id: "two", occurredAt: new Date("2026-09-02T04:00:00Z"), category: "STEMPEL", amount: 50 },
      { id: "outside", occurredAt: new Date("2026-09-03T04:00:00Z"), category: "ATK", amount: 999 },
    ],
  });
  expect(report.summary).toMatchObject({ revenue: 150.01, collected: 150.01, grossProfit: 0, manualIncomeCount: 2 });
  expect(report.subcategories).toEqual(expect.arrayContaining([
    expect.objectContaining({ categoryName: "ATK", subcategoryName: "Pemasukan manual", revenue: 100.01, grossProfit: 0, transactionCount: 1 }),
    expect.objectContaining({ categoryName: "Percetakan", subcategoryName: "Stempel", revenue: 50, grossProfit: 0, transactionCount: 1 }),
  ]));
  expect(report.paymentMethods).toEqual(expect.arrayContaining([
    expect.objectContaining({ method: "CASH", collected: 40 }),
    expect.objectContaining({ method: "TRANSFER", collected: 60.01 }),
    expect.objectContaining({ method: "Belum dicatat", collected: 50 }),
  ]));
  expect(report.trend.points[0]).toMatchObject({ omzet: 150.01, labaKotor: 0 });
});
