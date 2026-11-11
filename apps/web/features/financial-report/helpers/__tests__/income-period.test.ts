import { describe, expect, it } from "vitest";
import * as dailyIncome from "../daily-income";
import type { DailyIncomeReport, DailyIncomeTransaction, DailyManualIncome } from "../daily-income";

type Contribution = { date: string; amount: number; method: string; source: "transaction" | "manual" };
type Period = { days: DailyIncomeReport[]; contributions: Contribution[] };
type PeriodInput = { fromDate: string; toDate: string; transactions: DailyIncomeTransaction[]; manualIncome: DailyManualIncome[] };
const buildPeriod = (dailyIncome as typeof dailyIncome & { buildIncomePeriod?: (input: PeriodInput) => Period }).buildIncomePeriod;

const invoice = (overrides: Partial<DailyIncomeTransaction> = {}): DailyIncomeTransaction => ({
  id: "old-invoice", createdAt: new Date("2026-11-09T03:00:00Z"), status: "COMPLETED",
  paymentMethod: "CASH", total: 100_000, amountPaid: 100_000, change: 0,
  transactionCategory: "ATK", printingSubcategory: null, items: [],
  payments: [{ id: "initial", method: "CASH", amount: 40_000, createdAt: new Date("2026-11-10T03:00:00Z") }],
  debtPaymentLogs: [{ id: "settlement", paymentMethod: "TRANSFER", amount: 60_000, createdAt: new Date("2026-11-11T03:00:00Z") }],
  ...overrides,
});

describe("penerimaan untuk rentang tanggal", () => {
  it("menghitung DP awal, pelunasan nota lama, dan pemasukan manual pada tanggal penerimaan", () => {
    expect(buildPeriod).toBeTypeOf("function");
    if (!buildPeriod) return;
    const manual: DailyManualIncome = {
      id: "manual", occurredAt: new Date("2026-11-11T04:00:00Z"), category: "ATK", amount: 20_000,
      payments: [{ method: "CASH", amount: 10_000 }, { method: "TRANSFER", amount: 10_000 }],
    };
    const result = buildPeriod({ fromDate: "2026-11-10", toDate: "2026-11-11", transactions: [invoice()], manualIncome: [manual] });
    expect(result.days.map(({ date, total }) => [date, total])).toEqual([["2026-11-10", 40_000], ["2026-11-11", 80_000]]);
    expect(result.contributions.filter(row => row.date === "2026-11-11").reduce((sum, row) => sum + row.amount, 0)).toBe(80_000);
    expect(result.days[1].paymentMethods).toEqual(expect.arrayContaining([{ method: "CASH", amount: 10_000 }, { method: "TRANSFER", amount: 70_000 }]));
  });

  it("menghitung kembalian dan tidak menggandakan nota atau pembayaran", () => {
    expect(buildPeriod).toBeTypeOf("function");
    if (!buildPeriod) return;
    const payment = { id: "cash", method: "CASH", amount: 50, createdAt: new Date("2026-11-11T03:00:00Z") };
    const row = invoice({ total: 90, amountPaid: 100, change: 10, payments: [payment, payment, { id: "qris", method: "QRIS", amount: 50, createdAt: payment.createdAt }], debtPaymentLogs: [] });
    const report = buildPeriod({ fromDate: "2026-11-11", toDate: "2026-11-11", transactions: [row, row], manualIncome: [] }).days[0];
    expect(report.total).toBe(90);
    expect(report.paymentMethods).toEqual([{ method: "CASH", amount: 40 }, { method: "QRIS", amount: 50 }]);
  });

  it("membagi penerimaan pada tengah malam WIB", () => {
    expect(buildPeriod).toBeTypeOf("function");
    if (!buildPeriod) return;
    const row = invoice({ total: 200, amountPaid: 200, change: 0, debtPaymentLogs: [], payments: [
      { id: "before", method: "CASH", amount: 100, createdAt: new Date("2026-11-10T16:59:59Z") },
      { id: "after", method: "CASH", amount: 100, createdAt: new Date("2026-11-10T17:00:00Z") },
    ] });
    const report = buildPeriod({ fromDate: "2026-11-10", toDate: "2026-11-11", transactions: [row], manualIncome: [] });
    expect(report.days.map(day => day.total)).toEqual([100, 100]);
  });

  it("menempatkan pembayaran awal offline pada waktu checkout dan pelunasan pada waktu pembayaran", () => {
    expect(buildPeriod).toBeTypeOf("function"); if (!buildPeriod) return;
    const offline = invoice({
      createdAt: new Date("2026-11-10T03:00:00Z"),
      offlineSyncMetadata: { reason: "REPLAYED" },
      payments: [{ id: "initial", method: "CASH", amount: 40_000, createdAt: new Date("2026-11-11T03:00:00Z") }],
    } as Partial<DailyIncomeTransaction>);
    const result = buildPeriod({ fromDate: "2026-11-10", toDate: "2026-11-11", transactions: [offline], manualIncome: [] });
    expect(result.days.map(day => day.total)).toEqual([40_000, 60_000]);
    expect(result.contributions.map(row => [row.date, row.amount])).toEqual([["2026-11-10", 40_000], ["2026-11-11", 60_000]]);
  });

  it("tetap memakai waktu pembayaran aktual untuk transaksi online", () => {
    expect(buildPeriod).toBeTypeOf("function"); if (!buildPeriod) return;
    const online = invoice({ createdAt: new Date("2026-11-10T03:00:00Z"), payments: [{ id: "initial", method: "CASH", amount: 40_000, createdAt: new Date("2026-11-11T03:00:00Z") }] });
    const result = buildPeriod({ fromDate: "2026-11-10", toDate: "2026-11-11", transactions: [online], manualIncome: [] });
    expect(result.days.map(day => day.total)).toEqual([0, 100_000]);
  });

  it("mempertahankan sisa DP lama dan mengabaikan Tempo belum dibayar serta pemasukan terhapus", () => {
    expect(buildPeriod).toBeTypeOf("function");
    if (!buildPeriod) return;
    const dp = invoice({ id: "dp", status: "DP", total: 100, amountPaid: 25, payments: [], debtPaymentLogs: [] });
    const tempo = invoice({ id: "tempo", paymentMethod: "TEMPO", total: 100, amountPaid: 0, payments: [], debtPaymentLogs: [] });
    const deleted: DailyManualIncome = { id: "deleted", occurredAt: new Date("2026-11-11T03:00:00Z"), category: "ATK", amount: 50, deletedAt: new Date() };
    const report = buildPeriod({ fromDate: "2026-11-11", toDate: "2026-11-11", transactions: [dp, tempo], manualIncome: [deleted] }).days[0];
    expect(report.total).toBe(0);
    expect(report.outstandingDp).toBe(75);
  });
});
