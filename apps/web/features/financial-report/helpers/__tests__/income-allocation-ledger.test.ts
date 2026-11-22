import { describe, expect, it } from "vitest";
import { allocateIncomeItems } from "../income-categories";
import { buildIncomePeriod } from "../income-period";
import { buildFinancialReport } from "../report-core";
import { buildMonthlyPeriod, buildMonthlyReport } from "../monthly-report-core";
import { buildMonthlyWorkbook } from "../monthly-workbook";
import { buildReportCategorySummary } from "../journal-core";

const date = (day: string) => new Date(`${day}T03:00:00Z`);
const lines = [
  { productId: "buku", productName: "Buku", quantity: 1, unitCost: 0, subtotal: 1, product: { category: { name: "Lama" }, catalogSubcategory: { group: "ATK" as const, name: "Buku" } } },
  { productId: "print", productName: "Tinta", quantity: 1, unitCost: 0, subtotal: 1, product: { category: { name: "Lama" }, catalogSubcategory: { group: "PERCETAKAN" as const, name: "PRINT" } } },
];
const makeSale = () => ({
  id: "nota", invoiceNumber: "INV-1", createdAt: date("2026-09-02"), invoiceDate: date("2026-09-02"),
  status: "COMPLETED", paymentMethod: "CASH", total: 0.02, amountPaid: 0.02, change: 0, discount: 0,
  transactionCategory: "ATK", printingSubcategory: null, salesName: null, salesperson: null, customerName: null,
  items: lines,
  payments: [
    { id: "p1", method: "CASH", amount: 0.01, createdAt: date("2026-09-02") },
    { id: "p2", method: "TRANSFER", amount: 0.01, createdAt: date("2026-09-02") },
  ],
  debtPaymentLogs: [] as Array<{ id: string; paymentMethod: string; amount: number; createdAt: Date }>,
});
const cents = (amount: number) => Math.round(amount * 100);
const period = (month: number) => buildMonthlyPeriod(2026, month, date("2026-11-01"));
const monthly = (sale: ReturnType<typeof makeSale>, month = 9) => buildMonthlyReport({
  year: 2026, month, period: period(month), transactions: [sale], expenses: [], manualReceivables: [],
});
const totals = (rows: Array<{ category: string; subcategory: string; amount: number }>) => {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.category}/${row.subcategory}`;
    map.set(key, (map.get(key) ?? 0) + cents(row.amount));
  }
  return Object.fromEntries([...map].sort());
};

function bruteHighestAverages(weights: number[], amount: number) {
  const result = weights.map(() => 0);
  for (let seat = 0; seat < amount; seat++) {
    let best = 0;
    for (let index = 1; index < weights.length; index++) {
      if (weights[index] * (result[best] + 1) > weights[best] * (result[index] + 1)) best = index;
    }
    result[best]++;
  }
  return result;
}

describe("pembagian sen penerimaan per kategori", () => {
  it("menyamakan laporan penuh, jurnal, harian, dan workbook untuk dua metode lunas", () => {
    const sale = makeSale();
    const daily = buildIncomePeriod({ fromDate: "2026-09-02", toDate: "2026-09-02", transactions: [sale], manualIncome: [] });
    const general = buildFinancialReport({ dateFrom: "2026-09-02", dateTo: "2026-09-02", transactions: [sale], shifts: [] });
    const journal = buildReportCategorySummary([sale]);
    const month = monthly(sale);
    const expected = { "ATK/Buku": 1, "Percetakan/PRINT": 1 };

    expect(totals(daily.days[0].subcategories)).toEqual(expected);
    expect(totals(general.subcategories.map(row => ({ category: row.categoryName, subcategory: row.subcategoryName, amount: row.revenue })))).toEqual(expected);
    expect(Object.fromEntries(journal.map(row => [row.categoryName.replace(" / ", "/"), cents(row.revenue)]).sort())).toEqual(expected);
    expect(totals(month.income.flatMap(row => row.breakdown ?? []))).toEqual(expected);
    expect(month.income.map(row => Object.values(row.amounts).reduce((sum, value) => sum + cents(value), 0))).toEqual([1, 1]);
    const sheet = buildMonthlyWorkbook(month).Sheets["RC SEPTEMBER"];
    const detailAmounts = Object.entries(sheet).filter(([key, cell]) => /^B\d+$/.test(key) && ["Buku", "PRINT"].includes(String(cell.v)))
      .map(([key, cell]) => [String(cell.v), cents(Number(sheet[`C${key.slice(1)}`]?.v))]);
    expect(Object.fromEntries(detailAmounts.sort())).toEqual({ Buku: 1, PRINT: 1 });
  });

  it("mempertahankan tanggal DP dan pelunasan di bulan berbeda", () => {
    const sale = makeSale();
    sale.createdAt = date("2026-09-30"); sale.invoiceDate = sale.createdAt;
    sale.payments = [{ id: "dp", method: "CASH", amount: 0.01, createdAt: sale.createdAt }];
    sale.debtPaymentLogs = [{ id: "settled", paymentMethod: "TRANSFER", amount: 0.01, createdAt: date("2026-10-01") }];
    const september = buildIncomePeriod({ fromDate: "2026-09-30", toDate: "2026-09-30", transactions: [sale], manualIncome: [] });
    const october = buildIncomePeriod({ fromDate: "2026-10-01", toDate: "2026-10-01", transactions: [sale], manualIncome: [] });
    const septemberMonth = monthly(sale, 9); const octoberMonth = monthly(sale, 10);
    expect(september.days[0].total).toBe(0.01);
    expect(october.days[0].total).toBe(0.01);
    expect(totals(september.days[0].subcategories)).toEqual(totals(septemberMonth.income.flatMap(row => row.breakdown ?? [])));
    expect(totals(october.days[0].subcategories)).toEqual(totals(octoberMonth.income.flatMap(row => row.breakdown ?? [])));
    expect(totals([...september.days[0].subcategories, ...october.days[0].subcategories])).toEqual({ "ATK/Buku": 1, "Percetakan/PRINT": 1 });
    for (const entry of [...september.contributions, ...october.contributions]) {
      expect(entry.allocations.every(row => row.amount >= 0)).toBe(true);
      expect(entry.allocations.reduce((sum, row) => sum + cents(row.amount), 0)).toBe(cents(entry.amount));
    }
  });

  it("menyamakan jurnal dan laporan lengkap dengan DP serta pelunasan pada hari sama", () => {
    const sale = makeSale();
    sale.payments = [{ id: "dp", method: "CASH", amount: 0.01, createdAt: sale.createdAt }];
    sale.debtPaymentLogs = [{ id: "settled", paymentMethod: "TRANSFER", amount: 0.01, createdAt: sale.createdAt }];
    const daily = buildIncomePeriod({ fromDate: "2026-09-02", toDate: "2026-09-02", transactions: [sale], manualIncome: [] });
    const report = buildFinancialReport({ dateFrom: "2026-09-02", dateTo: "2026-09-02", transactions: [sale], shifts: [] });
    const journal = buildReportCategorySummary([sale]);
    const expected = { "ATK/Buku": 1, "Percetakan/PRINT": 1 };
    expect(totals(daily.days[0].subcategories)).toEqual(expected);
    expect(totals(monthly(sale).income.flatMap(row => row.breakdown ?? []))).toEqual(expected);
    expect(totals(report.subcategories.map(row => ({ category: row.categoryName, subcategory: row.subcategoryName, amount: row.revenue })))).toEqual(expected);
    expect(Object.fromEntries(journal.map(row => [row.categoryName.replace(" / ", "/"), cents(row.revenue)]).sort())).toEqual(expected);
  });

  it("memakai alokasi monoton yang sama dengan pembagi tertinggi brute force, termasuk tie", () => {
    for (let a = 1; a <= 4; a++) for (let b = 1; b <= 4; b++) for (let c = 1; c <= 4; c++) {
      const weights = [a, b, c];
      const input = { items: weights.map((weight, index) => ({ subtotal: weight / 100, product: { catalogSubcategory: { group: "ATK" as const, name: String.fromCharCode(65 + index) } } })) };
      let previous = [0, 0, 0];
      for (let value = 0; value <= 30; value++) {
        const actual = allocateIncomeItems(value / 100, input).map(row => cents(row.amount));
        expect(actual).toEqual(bruteHighestAverages(weights, value));
        expect(actual.every((count, index) => count >= previous[index])).toBe(true);
        previous = actual;
      }
    }
  });

  it("tidak mengurangi bagian saat total naik pada contoh Alabama paradox", () => {
    const weights = [1500, 1500, 900, 500, 500, 200];
    const input = { items: weights.map((weight, index) => ({ subtotal: weight, product: { catalogSubcategory: { group: "ATK" as const, name: String.fromCharCode(65 + index) } } })) };
    const before = allocateIncomeItems(0.25, input).map(row => cents(row.amount));
    const after = allocateIncomeItems(0.26, input).map(row => cents(row.amount));
    expect(before).toEqual(bruteHighestAverages(weights, 25));
    expect(after).toEqual(bruteHighestAverages(weights, 26));
    expect(after.every((amount, index) => amount >= before[index])).toBe(true);
  });
  it("mempertahankan nominal negatif, tanpa bobot, dan nilai besar", () => {
    const noWeights = { transactionCategory: "ATK", items: [{ subtotal: 0, product: null }] };
    expect(allocateIncomeItems(7.25, noWeights)).toEqual([{ category: "ATK", subcategory: "Belum ditentukan", itemIndex: null, amount: 7.25 }]);
    expect(allocateIncomeItems(-7.25, noWeights)).toEqual([{ category: "ATK", subcategory: "Belum ditentukan", itemIndex: null, amount: -7.25 }]);
    const positive = allocateIncomeItems(1.23, { items: lines });
    const negative = allocateIncomeItems(-1.23, { items: lines });
    expect(negative.map(row => cents(row.amount))).toEqual(positive.map(row => -cents(row.amount)));
    const many = { items: Array.from({ length: 1000 }, (_, index) => ({ subtotal: index + 1, product: { catalogSubcategory: { group: "ATK" as const, name: String(index).padStart(4, "0") } } })) };
    const large = allocateIncomeItems(9_999_999_999.99, many);
    expect(large.reduce((sum, row) => sum + cents(row.amount), 0)).toBe(999_999_999_999);
  });

  it("membedakan bobot besar yang kehilangan presisi bila dikalikan sebagai number", () => {
    const weights = [999_999_999_997, 999_999_999_999];
    const input = { items: weights.map((weight, index) => ({ subtotal: weight / 100, product: { catalogSubcategory: { group: "ATK" as const, name: String(index) } } })) };
    expect(allocateIncomeItems(0.01, input).map(row => cents(row.amount))).toEqual([0, 1]);
    expect(() => allocateIncomeItems(Number.MAX_SAFE_INTEGER, input)).toThrow(RangeError);
  });

  it("mengalokasikan penerimaan bersih setelah kembalian tanpa nominal negatif", () => {
    const sale = makeSale();
    sale.amountPaid = 0.03; sale.change = 0.01;
    sale.payments = [
      { id: "cash", method: "CASH", amount: 0.02, createdAt: sale.createdAt },
      { id: "transfer", method: "TRANSFER", amount: 0.01, createdAt: sale.createdAt },
    ];
    const daily = buildIncomePeriod({ fromDate: "2026-09-02", toDate: "2026-09-02", transactions: [sale], manualIncome: [] });
    expect(daily.days[0].total).toBe(0.02);
    expect(totals(daily.days[0].subcategories)).toEqual({ "ATK/Buku": 1, "Percetakan/PRINT": 1 });
    for (const row of daily.contributions) {
      expect(row.allocations.every(part => part.amount >= 0)).toBe(true);
      expect(row.allocations.reduce((sum, part) => sum + cents(part.amount), 0)).toBe(cents(row.amount));
    }
  });
});
