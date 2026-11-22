import { describe, expect, it } from "vitest";
import { buildMonthlyPeriod, buildMonthlyReport } from "../monthly-report-core";
import { buildMonthlyWorkbook } from "../monthly-workbook";
import { buildManualPayableReport } from "../manual-payable-report";

const period = buildMonthlyPeriod(2026, 11, new Date("2026-12-01T00:00:00Z"));
const input = { year: 2026, month: 11, period, transactions: [], expenses: [], manualReceivables: [] };
const receivable = {
  id: "receivable-1", debtDate: new Date("2026-10-01T00:00:00Z"), dueDate: new Date("2026-11-30T00:00:00Z"),
  amount: 100, note: null, customer: { name: "Pelanggan" },
  payments: [{ id: "payment-1", method: "CASH", amount: 60, createdAt: new Date("2026-11-05T04:00:00Z"), paidAt: new Date("2026-11-02T00:00:00Z") }],
};

describe("kategori laporan untuk catatan manual", () => {
  it.each(["ATK", "CETAK", "PLAT", "STEMPEL", "SPANDUK", "PRINT"] as const)("mencatat pembayaran piutang ke %s pada tanggal koreksi", (reportCategory) => {
    const report = buildMonthlyReport({ ...input, manualReceivables: [{ ...receivable, reportCategory }] });
    expect(report.income).toHaveLength(1);
    expect(report.income[0].date).toBe("2026-11-02");
    expect(report.income[0].amounts[reportCategory]).toBe(60);
    expect(report.income[0].amounts.UNMAPPED).toBe(0);
    expect(report.receivables[0].amount).toBe(40);
  });

  it("menjaga piutang lama tanpa kategori dalam total dan tanggal pencatatan semula", () => {
    const old = { ...receivable, payments: [{ ...receivable.payments[0], paidAt: null }] };
    const report = buildMonthlyReport({ ...input, manualReceivables: [old] });
    expect(report.income[0]).toMatchObject({ date: "2026-11-05", amounts: { UNMAPPED: 60 } });
    expect(report.warnings.some((warning) => warning.includes("pemetaan"))).toBe(true);
  });

  it("menggunakan tanggal pembayaran yang dikoreksi saat menentukan periode dan saldo", () => {
    const paidBeforePeriod = { ...receivable, amount: 60, reportCategory: "ATK" as const, payments: [{ ...receivable.payments[0], paidAt: new Date("2026-10-30T00:00:00Z") }] };
    const report = buildMonthlyReport({ ...input, manualReceivables: [paidBeforePeriod] });
    expect(report.income).toEqual([]);
    expect(report.receivables).toEqual([]);
  });

  it.each(["CETAK_PLAT", "SPANDUK", "ATK", "SALARY"] as const)("menempatkan transfer manual ke kelompok %s", (reportCategory) => {
    const expense = { id: "transfer-1", occurredAt: new Date("2026-11-02T03:00:00Z"), category: "SUPPLIES", reportCategory,
      amount: 100, changeAmount: 0, description: "Belanja", applicantName: "Pemasok", manualPurchasePaymentMethod: "TRANSFER" };
    const report = buildMonthlyReport({ ...input, expenses: [expense] });
    expect(report.purchaseExpenses).toHaveLength(1);
    expect(report.purchaseExpenses?.[0]).toMatchObject({ group: reportCategory, amount: 100 });
    expect(report.warnings.some((warning) => warning.includes("Lain-lain"))).toBe(false);
  });

  it("menampilkan kategori dan tanggal yang sama pada Excel bulanan", () => {
    const expense = { id: "transfer-1", occurredAt: new Date("2026-11-02T03:00:00Z"), category: "SUPPLIES", reportCategory: "ATK" as const,
      amount: 100, changeAmount: 0, description: "Belanja", applicantName: "Pemasok", manualPurchasePaymentMethod: "TRANSFER" };
    const report = buildMonthlyReport({ ...input, expenses: [expense], manualReceivables: [{ ...receivable, reportCategory: "ATK" }] });
    const workbook = buildMonthlyWorkbook(report);

    expect(workbook.Sheets.NOVEMBER.F10.v).toBe(60);
    expect(workbook.Sheets.NOVEMBER.J10.v).toBe(100);
    expect(workbook.Sheets.NOVEMBER.K10.v).toBe(0);
    expect(workbook.Sheets.BERSIH.F24.v).toBe(60);
    expect(workbook.Sheets.BERSIH.F25.v).toBe(100);
    expect(workbook.Sheets.BERSIH.F27.v).toBe(-40);
  });

  it("memasukkan pembayaran dan pelunasan otomatis hutang ke laporan serta Excel menurut tanggalnya", () => {
    const manualPayableReport = buildManualPayableReport({ storeId: "store-1", todayWib: "2026-12-01", from: period.from, to: period.to, transfers: [], payables: [{
      id: "d1", storeId: "store-1", supplierName: "Pemasok", amountCents: 100_000, debtDate: "2026-11-01", dueDate: "2026-11-03", category: "ATK",
      payments: [{ id: "p1", amountCents: 40_000, paidAt: "2026-11-05", origin: "MANUAL" }],
    }] });
    const report = buildMonthlyReport({ ...input, manualPayableReport });
    expect(report.expenses).toMatchObject([{ date: "2026-11-03", amount: 600, group: "ATK" }, { date: "2026-11-05", amount: 400, group: "ATK" }]);
    const workbook = buildMonthlyWorkbook(report);
    expect(workbook.Sheets.NOVEMBER.J11.v).toBe(600);
    expect(workbook.Sheets.NOVEMBER.J13.v).toBe(400);
    expect(workbook.Sheets.BERSIH.F25.v).toBe(1000);
  });

  it("menghitung transfer dan pembayaran hutang yang sama satu kali sesuai kategori masing-masing", () => {
    const payables = [{ id: "d1", storeId: "store-1", supplierName: "Pemasok A", amountCents: 10_000, debtDate: "2026-11-01", dueDate: null, category: "ATK" as const,
      payments: [{ id: "p1", amountCents: 10_000, paidAt: "2026-11-05", origin: "MANUAL" as const }] },
    { id: "d2", storeId: "store-1", supplierName: "Pemasok B", amountCents: 20_000, debtDate: "2026-11-01", dueDate: null, category: "SPANDUK" as const,
      payments: [{ id: "p2", amountCents: 20_000, paidAt: "2026-11-05", origin: "MANUAL" as const }] }];
    const manualPayableReport = buildManualPayableReport({ storeId: "store-1", todayWib: "2026-12-01", from: period.from, to: period.to, payables, transfers: [{
      id: "transfer-1", storeId: "store-1", date: "2026-11-05", amountCents: 35_000, category: "SALARY",
      allocations: [{ paymentId: "p1", payableId: "d1", amountCents: 10_000 }, { paymentId: "p2", payableId: "d2", amountCents: 20_000 }],
    }] });
    const expense = { id: "transfer-1", occurredAt: new Date("2026-11-05T03:00:00Z"), category: "SUPPLIES", reportCategory: "SALARY" as const,
      amount: 350, changeAmount: 0, description: "Belanja", applicantName: "Pemasok", manualPurchasePaymentMethod: "TRANSFER" };
    const report = buildMonthlyReport({ ...input, expenses: [expense], manualPayableReport });
    expect(report.expenses).toEqual([]);
    expect(report.purchaseExpenses?.map(({ group, amount }) => ({ group, amount }))).toEqual([
      { group: "ATK", amount: 100 }, { group: "SPANDUK", amount: 200 }, { group: "SALARY", amount: 50 },
    ]);
    const workbook = buildMonthlyWorkbook(report);
    expect(workbook.Sheets.NOVEMBER.J13.v).toBe(100);
    expect(workbook.Sheets.NOVEMBER.I13.v).toBe(200);
    expect(workbook.Sheets.NOVEMBER.L13.v).toBe(50);
    expect(workbook.Sheets.BERSIH.F25.v).toBe(350);
  });
});
