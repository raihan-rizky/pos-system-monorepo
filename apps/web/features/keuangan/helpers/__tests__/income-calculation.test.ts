import { describe, expect, it } from "vitest";
import * as calculation from "../income-calculation";

describe("rincian perhitungan pemasukan", () => {
  it("menjumlahkan penjualan, pemasukan manual, dan pelunasan piutang manual tanpa menggandakan pembayaran", () => {
    const calculate = (calculation as { buildIncomeCalculation?: (period: unknown) => unknown }).buildIncomeCalculation;
    expect(calculate).toBeTypeOf("function");
    if (!calculate) return;
    const result = calculate({
      days: [{ date: "2026-11-10", total: 150_000 }],
      contributions: [
        { id: "sale-1", date: "2026-11-10", source: "transaction", transactionId: "invoice-1", amount: 100_000 },
        { id: "manual-1", date: "2026-11-10", source: "manual", manualIncomeId: "income-1", amount: 20_000 },
        { id: "receivable:payment-1", date: "2026-11-10", source: "manual-receivable", amount: 30_000 },
      ],
    });
    expect(result).toEqual({ total: 150_000, transactionCount: 1, manualEntryCount: 1,
      daily: [{ date: "2026-11-10", total: 150_000, count: 1, manualCount: 1, manualReceivable: 30_000 }],
      components: { sales: 100_000, manualIncome: 20_000, manualReceivable: 30_000 } });
  });

  it("tidak mengarang rincian jika kontribusi tidak cocok dengan total harian", () => {
    const calculate = (calculation as { buildIncomeCalculation?: (period: unknown, report: unknown[]) => { components: unknown } }).buildIncomeCalculation;
    expect(calculate).toBeTypeOf("function");
    if (!calculate) return;
    const result = calculate({ days: [{ date: "2026-11-10", total: 100 }], contributions: [] }, []);
    expect(result.components).toBeNull();
  });

  it("tidak menggandakan pelunasan piutang yang sudah ada di periode pemasukan", () => {
    const calculate = (calculation as { buildIncomeCalculation?: (period: unknown, report: unknown[]) => unknown }).buildIncomeCalculation;
    expect(calculate).toBeTypeOf("function");
    if (!calculate) return;
    const result = calculate({
      days: [{ date: "2026-11-10", total: 150_000 }],
      contributions: [
        { id: "sale-1", date: "2026-11-10", source: "transaction", transactionId: "invoice-1", amount: 100_000 },
        { id: "manual-1", date: "2026-11-10", source: "manual", manualIncomeId: "income-1", amount: 20_000 },
        { id: "receivable:payment-1", date: "2026-11-10", source: "manual-receivable", amount: 30_000 },
      ],
    }, [
      { id: "manual:receivable-1:payment-1", date: "2026-11-10", amounts: { UNMAPPED: 30_000 } },
      { id: "sale-1", date: "2026-11-10", amounts: { ATK: 100_000 } },
    ]);
    expect(result).toEqual({ total: 150_000, transactionCount: 1, manualEntryCount: 1,
      daily: [{ date: "2026-11-10", total: 150_000, count: 1, manualCount: 1, manualReceivable: 30_000 }],
      components: { sales: 100_000, manualIncome: 20_000, manualReceivable: 30_000 } });
  });
});
