import { describe, expect, it } from "vitest";
import { buildIncomePeriod } from "../income-period";
import { buildFinancialReport } from "../report-core";
import { buildMonthlyPeriod, buildMonthlyReport } from "../monthly-report-core";
import { buildMonthlyWorkbook } from "../monthly-workbook";
import { buildReportCategorySummary, buildReportRows, buildReportSheetData, buildReportFooter } from "../journal-core";

const time = new Date("2026-09-02T03:00:00Z");
const items = [
  { productName: "Buku", productId: "book", subtotal: 60, quantity: 1, unitCost: 20, product: { category: { name: "Lama" }, catalogSubcategory: { id: "a", group: "ATK" as const, name: "Buku", legacyCategoryId: null } } },
  { productName: "Tinta", productId: "ink", subtotal: 40, quantity: 1, unitCost: 10, product: { category: { name: "Lama" }, catalogSubcategory: { id: "p", group: "PERCETAKAN" as const, name: "PRINT", legacyCategoryId: null } } },
];
const transaction = {
  id: "old", invoiceNumber: "INV-OLD", createdAt: time, invoiceDate: time, status: "COMPLETED", paymentMethod: "CASH",
  transactionCategory: "ATK", printingSubcategory: null, total: 90, amountPaid: 90, change: 0, discount: 10,
  salesName: null, salesperson: null, customerName: null, items,
  payments: [{ id: "dp", method: "CASH", amount: 40, createdAt: time }],
  debtPaymentLogs: [{ id: "settled", paymentMethod: "TRANSFER", amount: 50, createdAt: time }],
};

describe("klasifikasi produk di laporan", () => {
  it("membagi setiap pembayaran campuran sekali dan mengikuti klasifikasi produk terbaru", () => {
    const original = buildIncomePeriod({ fromDate: "2026-09-02", toDate: "2026-09-02", transactions: [transaction], manualIncome: [] });
    expect(original.days[0]).toMatchObject({ total: 90, categories: [{ category: "ATK", amount: 54 }, { category: "Percetakan", amount: 36 }] });
    expect(original.contributions.map(row => row.allocations)).toEqual([
      [{ category: "ATK", subcategory: "Buku", amount: 24 }, { category: "Percetakan", subcategory: "PRINT", amount: 16 }],
      [{ category: "ATK", subcategory: "Buku", amount: 30 }, { category: "Percetakan", subcategory: "PRINT", amount: 20 }],
    ]);
    const moved = { ...transaction, items: [items[0], { ...items[1], product: { ...items[1].product, catalogSubcategory: { id: "s", group: "PERCETAKAN" as const, name: "STEMPEL", legacyCategoryId: null } } }] };
    expect(buildIncomePeriod({ fromDate: "2026-09-02", toDate: "2026-09-02", transactions: [moved], manualIncome: [] }).days[0].subcategories).toEqual(expect.arrayContaining([{ category: "Percetakan", subcategory: "STEMPEL", amount: 36 }]));
    const period = buildMonthlyPeriod(2026, 9, new Date("2026-10-01T00:00:00Z"));
    const movedReport = buildMonthlyReport({ year: 2026, month: 9, period, transactions: [moved], expenses: [], manualReceivables: [] });
    expect(movedReport.income.map(row => row.amounts.STEMPEL)).toEqual([16, 20]);
    const cells = Object.entries(buildMonthlyWorkbook(movedReport).Sheets["RC SEPTEMBER"]).filter(([key]) => !key.startsWith("!")).map(([, cell]) => cell.v);
    expect(cells).toEqual(expect.arrayContaining(["STEMPEL", 36]));
  });

  it("mempertahankan fallback lama dan membulatkan pecahan campuran tanpa selisih", () => {
    const old = { ...transaction, total: 0.01, amountPaid: 0.01, payments: [{ id: "p", method: "CASH", amount: 0.01, createdAt: time }], debtPaymentLogs: [], transactionCategory: "PERCETAKAN", printingSubcategory: "SPANDUK", items: [
      { ...items[0], subtotal: 1 }, { ...items[1], subtotal: 1 }, { productName: "Jasa", subtotal: 1, quantity: 1, unitCost: 0, printingServiceId: "service", product: null },
    ] };
    const day = buildIncomePeriod({ fromDate: "2026-09-02", toDate: "2026-09-02", transactions: [old], manualIncome: [{ id: "manual", occurredAt: time, category: "CETAK", amount: 2 }] }).days[0];
    expect(day.subcategories).toEqual(expect.arrayContaining([expect.objectContaining({ category: "Percetakan", subcategory: "Spanduk" }), { category: "Percetakan", subcategory: "Cetak", amount: 2 }]));
    expect(Math.round(day.subcategories.reduce((sum, row) => sum + row.amount, 0) * 100)).toBe(201);
  });

  it("merekonsiliasi rincian laporan umum dengan nilai nota sambil mempertahankan laba tercatat", () => {
    const report = buildFinancialReport({ dateFrom: "2026-09-02", dateTo: "2026-09-02", transactions: [transaction], shifts: [] });
    expect(report.summary.revenue).toBe(90);
    expect(report.categories).toEqual(expect.arrayContaining([expect.objectContaining({ categoryName: "ATK", revenue: 54 }), expect.objectContaining({ categoryName: "Percetakan", revenue: 36 })]));
    expect(report.subcategories).toEqual(expect.arrayContaining([expect.objectContaining({ categoryName: "ATK", subcategoryName: "Buku", revenue: 54, grossProfit: 40 }), expect.objectContaining({ categoryName: "Percetakan", subcategoryName: "PRINT", revenue: 36, grossProfit: 30 })]));
  });

  it("menyertakan rincian yang sama pada jurnal dan workbook bulanan", () => {
    const sale = { ...transaction, total: 90 };
    const rows = buildReportRows([sale], []);
    const categories = buildReportCategorySummary([sale]);
    const journal = buildReportSheetData(rows, buildReportFooter(rows), categories).flat();
    expect(journal).toEqual(expect.arrayContaining(["ATK / Buku", "Percetakan / PRINT", 54, 36]));
    const period = buildMonthlyPeriod(2026, 9, new Date("2026-10-01T00:00:00Z"));
    const report = buildMonthlyReport({ year: 2026, month: 9, period, transactions: [transaction], expenses: [], manualReceivables: [] });
    expect(report.income.map(row => row.amounts)).toEqual([expect.objectContaining({ ATK: 24, PRINT: 16 }), expect.objectContaining({ ATK: 30, PRINT: 20 })]);
    const workbook = buildMonthlyWorkbook(report);
    const sheet = workbook.Sheets["RC SEPTEMBER"];
    expect(sheet).toBeDefined();
    const values = Object.entries(sheet).filter(([key]) => !key.startsWith("!")).map(([, cell]) => cell.v);
    expect(values).toEqual(expect.arrayContaining(["ATK", "Buku", "Percetakan", "PRINT", 54, 36]));
  });
  it("menyamakan rincian harian dan bulanan untuk satu sen dan nota lama tanpa jenis", () => {
    const tiny = { ...transaction, total: 0.01, amountPaid: 0.01, payments: [{ id: "p", method: "CASH", amount: 0.01, createdAt: time }], debtPaymentLogs: [], items: items.map(item => ({ ...item, subtotal: 1 })) };
    const legacy = { ...transaction, id: "service", transactionCategory: "PERCETAKAN", printingSubcategory: null, total: 10, amountPaid: 10, payments: [{ id: "service-p", method: "CASH", amount: 10, createdAt: time }], debtPaymentLogs: [], items: [{ productName: "Jasa", subtotal: 10, printingServiceId: "s", product: null }] };
    const period = buildMonthlyPeriod(2026, 9, new Date("2026-10-01T00:00:00Z"));
    const monthly = buildMonthlyReport({ year: 2026, month: 9, period, transactions: [tiny, legacy], expenses: [], manualReceivables: [] });
    const daily = buildIncomePeriod({ fromDate: "2026-09-02", toDate: "2026-09-02", transactions: [tiny, legacy], manualIncome: [] });
    for (const contribution of daily.contributions) {
      expect(monthly.income.find(row => row.id === `${contribution.transactionId}:${contribution.id.split(":").at(-1)}`)?.breakdown).toEqual(contribution.allocations);
    }
  });
  it("menempatkan checkout offline pada tanggal transaksi di laporan harian dan bulanan", () => {
    const sale = { ...transaction, createdAt: new Date("2026-09-30T03:00:00Z"), invoiceDate: new Date("2026-09-30T03:00:00Z"), offlineSyncMetadata: { reason: "REPLAYED" }, total: 90, amountPaid: 90,
      payments: [{ id: "offline", method: "CASH", amount: 90, createdAt: new Date("2026-10-02T03:00:00Z") }], debtPaymentLogs: [] };
    const daily = buildIncomePeriod({ fromDate: "2026-09-30", toDate: "2026-09-30", transactions: [sale], manualIncome: [] });
    const period = buildMonthlyPeriod(2026, 9, new Date("2026-10-21T00:00:00Z"));
    const monthly = buildMonthlyReport({ year: 2026, month: 9, period, transactions: [sale], expenses: [], manualReceivables: [] });
    expect(monthly.income).toHaveLength(1);
    expect(monthly.income[0]).toMatchObject({ date: "2026-09-30", breakdown: daily.contributions[0].allocations });
  });
  it.each(["service-id", "manual-receipt"])("memisahkan produk lama ATK dari jasa percetakan %s", kind => {
    const mixed = { ...transaction, transactionCategory: "PERCETAKAN", printingSubcategory: "SPANDUK", printingReceipt: { subcategory: "SPANDUK" }, total: 100, amountPaid: 100,
      payments: [{ id: "p", method: "CASH", amount: 100, createdAt: time }], debtPaymentLogs: [], items: [
        { productName: "Kertas", subtotal: 60, product: { category: { name: "Kertas" } } },
        { productName: "Jasa", subtotal: 40, printingServiceId: kind === "service-id" ? "service" : null, product: null },
      ] };
    const daily = buildIncomePeriod({ fromDate: "2026-09-02", toDate: "2026-09-02", transactions: [mixed], manualIncome: [] });
    const period = buildMonthlyPeriod(2026, 9, new Date("2026-10-01T00:00:00Z"));
    const monthly = buildMonthlyReport({ year: 2026, month: 9, period, transactions: [mixed], expenses: [], manualReceivables: [] });
    expect(daily.days[0].subcategories).toEqual([{ category: "ATK", subcategory: "Kertas", amount: 60 }, { category: "Percetakan", subcategory: "Spanduk", amount: 40 }]);
    expect(monthly.income[0]).toMatchObject({ amounts: { ATK: 60, SPANDUK: 40 }, breakdown: daily.days[0].subcategories });
  });
  it("mempertahankan jenis nota lama ketika hanya metadata transaksi tersedia", () => {
    const legacy = { ...transaction, transactionCategory: "PERCETAKAN", printingSubcategory: "SPANDUK", total: 100, amountPaid: 100,
      payments: [{ id: "p", method: "CASH", amount: 100, createdAt: time }], debtPaymentLogs: [],
      items: [{ productName: "Barang lama", subtotal: 100, product: { category: { name: "Kertas" } } }] };
    expect(buildIncomePeriod({ fromDate: "2026-09-02", toDate: "2026-09-02", transactions: [legacy], manualIncome: [] }).days[0].subcategories).toEqual([{ category: "Percetakan", subcategory: "Spanduk", amount: 100 }]);
  });
});
