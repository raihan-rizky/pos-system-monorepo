import { describe, expect, it } from "vitest";
import { buildDailyIncome, buildDailyIncomeRange } from "../daily-income";
import { allocateIncomeSubcategories, incomeClassification } from "../income-categories";

const date = "2026-11-05";
const time = new Date("2026-11-05T03:00:00Z");
const payment = (id: string, method: string, amount: number, createdAt = time) => ({ id, method, amount, createdAt });
const transaction = (extra = {}) => ({
  id: "t1", createdAt: new Date("2026-10-01T03:00:00Z"), status: "COMPLETED", transactionCategory: "ATK", printingSubcategory: null,
  paymentMethod: "CASH", total: 100, amountPaid: 100, change: 0,
  payments: [payment("p1", "CASH", 100)], debtPaymentLogs: [],
  items: [{ subtotal: 60, product: { category: { name: "Alat Tulis" } } }, { subtotal: 40, product: { category: { name: "Kertas" } } }], ...extra,
});

describe("daily receipt ranges", () => {
  it("uses WIB midnight and accepts earlier single dates", () => {
    expect(buildDailyIncomeRange(date, new Date("2026-11-04T17:00:00Z"))).toEqual({ date, start: new Date("2026-11-04T17:00:00Z"), end: new Date("2026-11-05T17:00:00Z") });
    expect(buildDailyIncomeRange("2026-10-01", time).date).toBe("2026-10-01");
  });
  it.each(["2026-02-30", "2026-11-06", "2026-1-5", "", "2026-11-05,2026-11-06"])("rejects invalid/future dates %s", value => {
    expect(() => buildDailyIncomeRange(value, time)).toThrow();
  });
});

describe("income categories", () => {
  it("uses canonical printing markers rather than product names", () => {
    expect(incomeClassification(transaction()).category).toBe("ATK");
    expect(incomeClassification(transaction({ transactionCategory: null, printingReceipt: { subcategory: "PLAT" } }))).toEqual({ category: "Percetakan", subcategory: "Plat" });
    expect(incomeClassification(transaction({ transactionCategory: null, items: [{ printingServiceId: "s1", subtotal: 100 }] })).category).toBe("Percetakan");
    expect(incomeClassification(transaction({ transactionCategory: "PERCETAKAN", printingSubcategory: "PERCETAKAN" })).subcategory).toBe("Cetak");
  });
  it("allocates discount-adjusted receipts with deterministic rounding and missing weights", () => {
    const rows = allocateIncomeSubcategories(0.01, transaction({ items: [{ subtotal: 1, product: { category: { name: "A" } } }, { subtotal: 1, product: { category: { name: "B" } } }] }));
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(0.01);
    expect(allocateIncomeSubcategories(75, transaction({ items: [] }))).toEqual([{ category: "ATK", subcategory: "Belum ditentukan", amount: 75 }]);
  });
});

describe("daily cash received", () => {
  it.each(["2026-11-04T03:00:00Z", "2026-11-05T17:00:00Z"])("keeps the initial DP on its payment date when invoice date changes to %s", invoiceDate => {
    const tx = transaction({ createdAt: time, invoiceDate: new Date(invoiceDate), status: "DP", total: 50_000, amountPaid: 25_000, payments: [payment("dp", "CASH", 25_000)] });
    const report = buildDailyIncome({ date, transactions: [tx], manualIncome: [] });
    expect(report.total).toBe(25_000);
    expect(report.outstandingDp).toBe(25_000);
    expect(report.paymentMethods).toEqual([{ method: "CASH", amount: 25_000 }]);
  });
  it("attributes initial payments and settlements to their actual payment dates", () => {
    const tx = transaction({ createdAt: time, invoiceDate: new Date("2026-11-04T03:00:00Z"), total: 50_000, amountPaid: 50_000,
      payments: [payment("initial", "CASH", 25_000)],
      debtPaymentLogs: [{ id: "settlement", paymentMethod: "TRANSFER", amount: 25_000, createdAt: time }],
    });
    const today = buildDailyIncome({ date, transactions: [tx], manualIncome: [] });
    expect(today.total).toBe(50_000);
    expect(today.paymentMethods).toEqual([{ method: "CASH", amount: 25_000 }, { method: "TRANSFER", amount: 25_000 }]);
    expect(buildDailyIncome({ date: "2026-11-04", transactions: [tx], manualIncome: [] }).total).toBe(0);
  });
  it("uses the creation date for legacy payments and outstanding DP", () => {
    const tx = transaction({ createdAt: time, invoiceDate: new Date("2026-11-05T17:00:00Z"), status: "DP", total: 50_000, amountPaid: 25_000, payments: [] });
    expect(buildDailyIncome({ date, transactions: [tx], manualIncome: [] })).toMatchObject({ total: 25_000, outstandingDp: 25_000 });
    expect(buildDailyIncome({ date: "2026-11-06", transactions: [tx], manualIncome: [] })).toMatchObject({ total: 0, outstandingDp: 25_000 });
  });
  it("falls back to payment dates when invoiceDate is unavailable; categories and methods reconcile", () => {
    const report = buildDailyIncome({ date, transactions: [transaction()], manualIncome: [] });
    expect(report.total).toBe(100);
    expect(report.outstandingDp).toBe(0);
    expect(report.categories).toEqual([{ category: "ATK", amount: 100 }]);
    expect(report.subcategories).toEqual([{ category: "ATK", subcategory: "Alat Tulis", amount: 60 }, { category: "ATK", subcategory: "Kertas", amount: 40 }]);
    expect(report.paymentMethods).toEqual([{ method: "CASH", amount: 100 }]);
  });
  it("does not count DP twice when an old invoice is settled today", () => {
    const tx = transaction({ total: 100, amountPaid: 120, change: 20,
      payments: [payment("p1", "CASH", 60, new Date("2026-10-01T03:00:00Z"))],
      debtPaymentLogs: [{ id: "d1", paymentMethod: "TRANSFER", amount: 60, createdAt: time }],
    });
    expect(buildDailyIncome({ date, transactions: [tx], manualIncome: [] }).paymentMethods).toEqual([{ method: "TRANSFER", amount: 60 }]);
    expect(buildDailyIncome({ date: "2026-10-01", transactions: [tx], manualIncome: [] }).total).toBe(40);
  });
  it("returns change from cash first and ignores duplicated rows", () => {
    const tx = transaction({ total: 90, amountPaid: 100, change: 10, payments: [payment("p1", "CASH", 50), payment("p2", "QRIS", 50), payment("p2", "QRIS", 50)] });
    expect(buildDailyIncome({ date, transactions: [tx, tx], manualIncome: [] }).paymentMethods).toEqual([{ method: "CASH", amount: 40 }, { method: "QRIS", amount: 50 }]);
  });
  it("excludes inactive invoices, unpaid TEMPO and payments outside the WIB day", () => {
    const rows = [transaction({ status: "VOIDED" }), transaction({ id: "draft", status: "DRAFT" }), transaction({ id: "tempo", paymentMethod: "TEMPO", amountPaid: 0, payments: [] }), transaction({ id: "old", payments: [payment("old", "CASH", 100, new Date("2026-11-04T16:59:59Z"))] }), transaction({ id: "next", payments: [payment("next", "CASH", 100, new Date("2026-11-05T17:00:00Z"))] })];
    expect(buildDailyIncome({ date, transactions: rows, manualIncome: [] }).total).toBe(0);
  });
  it("counts legacy receipts at creation and handles DP without payment rows", () => {
    expect(buildDailyIncome({ date, transactions: [transaction({ createdAt: time, status: "DP", total: 100, amountPaid: 40, payments: [] })], manualIncome: [] })).toMatchObject({ total: 40, outstandingDp: 60 });
  });
  it("reports the remaining balance for active DP transactions separately from daily receipts", () => {
    const report = buildDailyIncome({
      date,
      transactions: [transaction({
        id: "old-dp",
        createdAt: new Date("2026-11-04T03:00:00Z"),
        status: "DP",
        total: 50_000,
        amountPaid: 25_000,
        payments: [payment("old-dp-payment", "CASH", 25_000, new Date("2026-11-04T03:00:00Z"))],
      })],
      manualIncome: [],
    });
    expect(report.total).toBe(0);
    expect(report.outstandingDp).toBe(25_000);
  });
  it("excludes future, inactive, fully paid, and TEMPO invoices from the current open DP balance", () => {
    const dp = transaction({ status: "DP", total: 50_000, amountPaid: 25_000 });
    const report = buildDailyIncome({ date, transactions: [
      dp, dp,
      { ...dp, id: "midnight", createdAt: new Date("2026-11-05T17:00:00Z") },
      { ...dp, id: "future", createdAt: new Date("2026-11-06T03:00:00Z") },
      { ...dp, id: "paid", amountPaid: 60_000 },
      { ...dp, id: "completed", status: "COMPLETED" },
      { ...dp, id: "voided", status: "VOIDED" },
      { ...dp, id: "pending", status: "PENDING_APPROVAL" },
      { ...dp, id: "tempo", paymentMethod: "TEMPO" },
    ], manualIncome: [] });
    expect(report.outstandingDp).toBe(25_000);
  });
  it("includes undeleted manual income without inventing a payment method", () => {
    const manual = { id: "m1", occurredAt: time, category: "SPANDUK", amount: 50, deletedAt: null };
    const report = buildDailyIncome({ date, transactions: [], manualIncome: [manual, manual, { ...manual, id: "deleted", deletedAt: time }] });
    expect(report.total).toBe(50);
    expect(report.categories).toEqual([{ category: "Percetakan", amount: 50 }]);
    expect(report.subcategories).toEqual([{ category: "Percetakan", subcategory: "Spanduk", amount: 50 }]);
    expect(report.paymentMethods).toEqual([{ method: "Belum dicatat", amount: 50 }]);
  });
});
