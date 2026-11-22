import { describe, expect, it } from "vitest";
import { buildIncomePeriod } from "../income-period";
import { buildFinancialReport } from "../report-core";
import { buildMonthlyPeriod, buildMonthlyReport } from "../monthly-report-core";
import { buildMonthlyWorkbook } from "../monthly-workbook";
import { buildReportCategorySummary } from "../journal-core";
import { buildReceiptHistoryUrl, parseReceiptHistoryParams } from "@/features/transaction-history/helpers/receipt-history";

const at = new Date("2026-09-02T03:00:00Z");
const legacy = {
  id: "legacy", invoiceNumber: "INV-LAMA", createdAt: at, invoiceDate: at, status: "COMPLETED", paymentMethod: "CASH",
  total: 100, amountPaid: 100, change: 0, discount: 0, transactionCategory: null as string | null, printingSubcategory: null as string | null,
  printingReceipt: null as { subcategory: string | null } | null, salesName: null, salesperson: null, customerName: null,
  items: [] as Array<{ productName: string; productId?: string | null; quantity: number; unitCost: number; subtotal: number; printingServiceId?: string | null; product?: { category?: { name: string } | null } | null }>,
  payments: [{ id: "cash", method: "CASH", amount: 100, createdAt: at }], debtPaymentLogs: [],
};
const monthly = (sale: typeof legacy) => buildMonthlyReport({ year: 2026, month: 9, period: buildMonthlyPeriod(2026, 9, new Date("2026-10-10T00:00:00Z")), transactions: [sale], expenses: [], manualReceivables: [] });
const daily = (sale: typeof legacy) => buildIncomePeriod({ fromDate: "2026-09-02", toDate: "2026-09-02", transactions: [sale], manualIncome: [] }).days[0];
const full = (sale: typeof legacy) => buildFinancialReport({ dateFrom: "2026-09-02", dateTo: "2026-09-02", transactions: [sale], shifts: [] });
const journal = (sale: typeof legacy) => buildReportCategorySummary([sale]);

describe("klasifikasi pemasukan historis yang belum diketahui", () => {
  it("tidak menebak kategori nota tanpa item dan metadata di laporan atau ekspor", () => {
    const report = monthly(legacy);
    expect(daily(legacy)).toMatchObject({ total: 100, categories: [{ category: "Belum ditentukan", amount: 100 }], subcategories: [{ category: "Belum ditentukan", subcategory: "Belum ditentukan", amount: 100 }] });
    expect(full(legacy).subcategories).toEqual([expect.objectContaining({ categoryName: "Belum ditentukan", subcategoryName: "Belum ditentukan", revenue: 100 })]);
    expect(journal(legacy)).toEqual([expect.objectContaining({ categoryName: "Belum ditentukan / Belum ditentukan", revenue: 100 })]);
    expect(report.income[0]).toMatchObject({ amounts: { ATK: 0, UNMAPPED: 100 }, breakdown: [{ category: "Belum ditentukan", subcategory: "Belum ditentukan", amount: 100 }] });
    const sheet = buildMonthlyWorkbook(report).Sheets["RC SEPTEMBER"];
    expect(sheet.H7.v).toBe(100);
    const detail = Object.entries(sheet).filter(([key, cell]) => /^A\d+$/.test(key) && cell.v === "Belum ditentukan").map(([key]) => key.slice(1));
    expect(detail.some(row => sheet[`B${row}`]?.v === "Belum ditentukan" && sheet[`C${row}`]?.v === 100)).toBe(true);
  });

  it("tetap memakai kategori produk lama saat ada bukti kategori produk", () => {
    const sale = { ...legacy, items: [{ productName: "Kertas", productId: "p", quantity: 1, unitCost: 20, subtotal: 100, product: { category: { name: "Kertas" } } }] };
    expect(daily(sale).subcategories).toEqual([{ category: "ATK", subcategory: "Kertas", amount: 100 }]);
    expect(monthly(sale).income[0]).toMatchObject({ amounts: { ATK: 100, UNMAPPED: 0 }, breakdown: [{ category: "ATK", subcategory: "Kertas", amount: 100 }] });
    expect(full(sale).subcategories).toEqual([expect.objectContaining({ categoryName: "ATK", subcategoryName: "Kertas", revenue: 100 })]);
    expect(journal(sale)).toEqual([expect.objectContaining({ categoryName: "ATK / Kertas", revenue: 100 })]);
  });

  it("tidak menebak item tanpa produk dalam nota campuran yang tidak punya jenis", () => {
    const sale = { ...legacy, items: [
      { productName: "Kertas", productId: "p", quantity: 1, unitCost: 0, subtotal: 60, product: { category: { name: "Kertas" } } },
      { productName: "Lainnya", quantity: 1, unitCost: 0, subtotal: 40, product: null },
    ] };
    const parts = [ { category: "ATK", subcategory: "Kertas", amount: 60 }, { category: "Belum ditentukan", subcategory: "Belum ditentukan", amount: 40 } ];
    expect(daily(sale).subcategories).toEqual(parts);
    expect(monthly(sale).income[0]).toMatchObject({ amounts: { ATK: 60, UNMAPPED: 40 }, breakdown: parts });
    expect(full(sale).subcategories.map(row => [row.categoryName, row.subcategoryName, row.revenue])).toEqual(parts.map(row => [row.category, row.subcategory, row.amount]));
    expect(journal(sale)).toEqual(expect.arrayContaining(parts.map(row => expect.objectContaining({ categoryName: `${row.category} / ${row.subcategory}`, revenue: row.amount }))));
  });

  it("mempertahankan nota ATK serta petunjuk jenis nota percetakan lama", () => {
    const atk = { ...legacy, transactionCategory: "ATK" };
    const spanduk = { ...legacy, printingSubcategory: "SPANDUK" };
    expect(daily(atk).subcategories).toEqual([{ category: "ATK", subcategory: "Belum ditentukan", amount: 100 }]);
    expect(monthly(atk).income[0].amounts.ATK).toBe(100);
    expect(daily(spanduk).subcategories).toEqual([{ category: "Percetakan", subcategory: "Spanduk", amount: 100 }]);
    expect(monthly(spanduk).income[0].amounts.SPANDUK).toBe(100);
  });

  it("membuka Riwayat dari kategori yang belum ditentukan", () => {
    const url = new URL(buildReceiptHistoryUrl({ date: "2026-09-02", mode: "receipt", category: "Belum ditentukan", subcategory: "Belum ditentukan" }), "http://localhost");
    expect(parseReceiptHistoryParams(Object.fromEntries(url.searchParams))).toMatchObject({ status: "valid", category: "Belum ditentukan", subcategory: "Belum ditentukan" });
  });
});
