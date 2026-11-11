import { netInitialPayments } from "@/features/customer-debt/helpers/net-initial-payments";
import type { DailyIncomeReport, DailyIncomeTransaction, DailyManualIncome } from "./daily-income";
import { allocateIncomeSubcategories, incomeClassification, type IncomeCategory, type IncomeSubcategoryRow } from "./income-categories";

export type ReceiptContribution = {
  id: string;
  date: string;
  source: "transaction" | "manual";
  transactionId: string | null;
  manualIncomeId: string | null;
  method: string;
  amount: number;
  allocations: IncomeSubcategoryRow[];
};

export type OutstandingDpEntry = { transactionId: string; createdAt: Date; remaining: number };
export type IncomePeriod = { days: DailyIncomeReport[]; contributions: ReceiptContribution[]; outstandingDp: OutstandingDpEntry[] };
export type IncomePeriodInput = { fromDate: string; toDate: string; transactions: DailyIncomeTransaction[]; manualIncome: DailyManualIncome[] };

const dayMs = 86_400_000;
const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
const dateKey = (date: Date) => formatter.format(date);
const money = (value: unknown) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric * 100)) / 100 : 0;
};
const unique = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map(row => [row.id, row])).values()];

function startOfDay(value: string): Date {
  const date = new Date(`${value}T00:00:00+07:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || dateKey(date) !== value) {
    throw new RangeError("Pilih tanggal yang valid.");
  }
  return date;
}

export function buildIncomePeriod(input: IncomePeriodInput): IncomePeriod {
  const start = startOfDay(input.fromDate).getTime();
  const end = startOfDay(input.toDate).getTime() + dayMs;
  if (end <= start) throw new RangeError("Rentang tanggal tidak valid.");

  const contributions: ReceiptContribution[] = [];
  const outstandingDp: OutstandingDpEntry[] = [];
  for (const tx of unique(input.transactions)) {
    if (tx.status !== "COMPLETED" && tx.status !== "DP") continue;
    if (tx.status === "DP" && tx.paymentMethod !== "TEMPO" && tx.createdAt.getTime() < end) {
      const totalCents = Math.round(money(tx.total) * 100);
      const paidCents = Math.min(totalCents, Math.round(money(tx.amountPaid) * 100));
      outstandingDp.push({ transactionId: tx.id, createdAt: tx.createdAt, remaining: Math.max(0, totalCents - paidCents) / 100 });
    }

    const retained = Math.min(money(tx.total), Math.max(0, money(tx.amountPaid) - money(tx.change)));
    const debts = unique(tx.debtPaymentLogs).map(row => ({ ...row, method: row.paymentMethod }));
    const debtTotal = debts.reduce((sum, row) => sum + (row.method === "TEMPO" ? 0 : money(row.amount)), 0);
    const initialLimit = Math.max(0, retained - debtTotal);
    const initial = unique(tx.payments).map(row => tx.offlineSyncMetadata
      ? { ...row, createdAt: tx.createdAt }
      : row);
    const ledger = initial.length ? initial : tx.paymentMethod === "TEMPO" ? [] : [{ id: `legacy-${tx.id}`, method: tx.paymentMethod, amount: initialLimit, createdAt: tx.createdAt }];
    const rows = [
      ...netInitialPayments(ledger, { total: initialLimit, amountPaid: initialLimit }).map(row => ({ ...row, kind: "payment" })),
      ...netInitialPayments(debts, { total: Math.min(debtTotal, retained), amountPaid: Math.min(debtTotal, retained) }).map(row => ({ ...row, kind: "debt" })),
    ];
    for (const row of rows) {
      if (row.method === "TEMPO" || row.amount <= 0 || row.createdAt.getTime() < start || row.createdAt.getTime() >= end) continue;
      contributions.push({
        id: `${tx.id}:${row.kind}:${row.id}`, date: dateKey(row.createdAt), source: "transaction",
        transactionId: tx.id, manualIncomeId: null, method: row.method, amount: row.amount,
        allocations: allocateIncomeSubcategories(row.amount, tx),
      });
    }
  }

  for (const row of unique(input.manualIncome)) {
    if (row.deletedAt || row.occurredAt.getTime() < start || row.occurredAt.getTime() >= end) continue;
    const amount = money(row.amount);
    const classification = row.category === "ATK"
      ? { category: "ATK" as const, subcategory: "Pemasukan manual" }
      : incomeClassification({ transactionCategory: "PERCETAKAN", printingSubcategory: row.category, items: [] });
    const payments = row.payments ?? [];
    const paymentCents = payments.reduce((sum, payment) => sum + Math.round(money(payment.amount) * 100), 0);
    const balanced = payments.length > 0 && paymentCents === Math.round(amount * 100);
    const parts = balanced ? payments : [{ method: "Belum dicatat", amount }];
    parts.forEach((payment, index) => {
      const part = money(payment.amount);
      if (part <= 0) return;
      contributions.push({
        id: `${row.id}:manual:${index}`, date: dateKey(row.occurredAt), source: "manual",
        transactionId: null, manualIncomeId: row.id, method: payment.method, amount: part,
        allocations: [{ ...classification, amount: part }],
      });
    });
  }

  const days: DailyIncomeReport[] = [];
  for (let at = start; at < end; at += dayMs) {
    const date = dateKey(new Date(at));
    const categories = new Map<IncomeCategory, number>();
    const subcategories = new Map<string, IncomeSubcategoryRow>();
    const methods = new Map<string, number>();
    let totalCents = 0;
    for (const row of contributions) {
      if (row.date !== date) continue;
      const cents = Math.round(row.amount * 100);
      totalCents += cents;
      methods.set(row.method, (methods.get(row.method) ?? 0) + cents);
      for (const allocation of row.allocations) {
        const rowCents = Math.round(allocation.amount * 100);
        categories.set(allocation.category, (categories.get(allocation.category) ?? 0) + rowCents);
        const key = JSON.stringify([allocation.category, allocation.subcategory]);
        const previous = subcategories.get(key);
        subcategories.set(key, { ...allocation, amount: (Math.round((previous?.amount ?? 0) * 100) + rowCents) / 100 });
      }
    }
    days.push({
      date,
      total: totalCents / 100,
      outstandingDp: outstandingDp.filter(row => row.createdAt.getTime() < at + dayMs).reduce((sum, row) => sum + Math.round(row.remaining * 100), 0) / 100,
      categories: [...categories].map(([category, cents]) => ({ category, amount: cents / 100 })).sort((a, b) => a.category.localeCompare(b.category)),
      subcategories: [...subcategories.values()].sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory)),
      paymentMethods: [...methods].map(([method, cents]) => ({ method, amount: cents / 100 })).sort((a, b) => a.method.localeCompare(b.method)),
    });
  }
  return { days, contributions, outstandingDp };
}
