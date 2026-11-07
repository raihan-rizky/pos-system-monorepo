import { netInitialPayments } from "@/features/customer-debt/helpers/net-initial-payments";
import { allocateIncomeSubcategories, incomeClassification, type IncomeClassificationInput, type IncomeCategory, type IncomeSubcategoryRow } from "./income-categories";

export const DAILY_INCOME_PERMISSIONS = {
  total: "financial-report.daily-income",
  outstandingDp: "financial-report.daily-outstanding-dp",
  categories: "financial-report.daily-category",
  subcategories: "financial-report.daily-subcategory",
  paymentMethods: "financial-report.daily-payment-method",
} as const;
export type DailyIncomeAccess = Record<keyof typeof DAILY_INCOME_PERMISSIONS, boolean>;
type Payment = { id: string; method: string; amount: unknown; createdAt: Date };
export type DailyIncomeTransaction = IncomeClassificationInput & {
  id: string; createdAt: Date; status: string; paymentMethod: string; total: unknown; amountPaid: unknown; change?: unknown;
  payments: Payment[];
  debtPaymentLogs: Array<{ id: string; paymentMethod: string; amount: unknown; createdAt: Date }>;
};
export type DailyManualIncome = { id: string; occurredAt: Date; category: string; amount: unknown; deletedAt?: Date | null };
export type DailyIncomeReport = {
  date: string; total: number;
  outstandingDp: number;
  categories: Array<{ category: IncomeCategory; amount: number }>;
  subcategories: IncomeSubcategoryRow[];
  paymentMethods: Array<{ method: string; amount: number }>;
};
export type DailyIncomeResponse = Pick<DailyIncomeReport, "date"> & Partial<Omit<DailyIncomeReport, "date">> & { viewMode?: "full" };

export function jakartaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function buildDailyIncomeRange(date: string, now = new Date()) {
  const start = new Date(`${date}T00:00:00+07:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(start.getTime()) || jakartaToday(start) !== date || date > jakartaToday(now)) {
    throw new RangeError("Pilih satu tanggal yang valid, hari ini atau sebelumnya.");
  }
  return { date, start, end: new Date(start.getTime() + 86_400_000) };
}

const money = (value: unknown) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric * 100)) / 100 : 0;
};
const unique = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map(row => [row.id, row])).values()];

export function buildDailyIncome(input: { date: string; transactions: DailyIncomeTransaction[]; manualIncome: DailyManualIncome[] }): DailyIncomeReport {
  const start = new Date(`${input.date}T00:00:00+07:00`).getTime();
  const inDay = (value: Date) => value.getTime() >= start && value.getTime() < start + 86_400_000;
  const categories = new Map<IncomeCategory, number>();
  const subcategories = new Map<string, IncomeSubcategoryRow>();
  const methods = new Map<string, number>();
  let totalCents = 0;
  let outstandingDpCents = 0;
  const add = (amount: number, method: string, breakdown: IncomeSubcategoryRow[]) => {
    const cents = Math.round(amount * 100);
    if (cents <= 0) return;
    totalCents += cents;
    methods.set(method, (methods.get(method) ?? 0) + cents);
    for (const row of breakdown) {
      const rowCents = Math.round(row.amount * 100);
      categories.set(row.category, (categories.get(row.category) ?? 0) + rowCents);
      const key = JSON.stringify([row.category, row.subcategory]);
      const previous = subcategories.get(key);
      subcategories.set(key, { ...row, amount: (Math.round((previous?.amount ?? 0) * 100) + rowCents) / 100 });
    }
  };
  for (const tx of unique(input.transactions)) {
    if (tx.status !== "COMPLETED" && tx.status !== "DP") continue;
    if (tx.status === "DP" && tx.paymentMethod !== "TEMPO" && tx.createdAt.getTime() < start + 86_400_000) {
      const totalCents = Math.round(money(tx.total) * 100);
      const paidCents = Math.min(totalCents, Math.round(money(tx.amountPaid) * 100));
      outstandingDpCents += Math.max(0, totalCents - paidCents);
    }
    const retained = Math.min(money(tx.total), Math.max(0, money(tx.amountPaid) - money(tx.change)));
    const debts = unique(tx.debtPaymentLogs).map(row => ({ ...row, method: row.paymentMethod }));
    const debtTotal = debts.reduce((sum, row) => sum + (row.method === "TEMPO" ? 0 : money(row.amount)), 0);
    const initialLimit = Math.max(0, retained - debtTotal);
    const initial = unique(tx.payments);
    const ledger = initial.length ? initial : tx.paymentMethod === "TEMPO" ? [] : [{ id: `legacy-${tx.id}`, method: tx.paymentMethod, amount: initialLimit, createdAt: tx.createdAt }];
    const events = [
      ...netInitialPayments(ledger, { total: initialLimit, amountPaid: initialLimit }),
      ...netInitialPayments(debts, { total: Math.min(debtTotal, retained), amountPaid: Math.min(debtTotal, retained) }),
    ];
    for (const event of events) {
      if (event.method === "TEMPO" || event.amount <= 0 || !inDay(event.createdAt)) continue;
      add(event.amount, event.method, allocateIncomeSubcategories(event.amount, tx));
    }
  }
  for (const row of unique(input.manualIncome)) {
    if (row.deletedAt || !inDay(row.occurredAt)) continue;
    const amount = money(row.amount);
    const classification = row.category === "ATK"
      ? { category: "ATK" as const, subcategory: "Pemasukan manual" }
      : incomeClassification({ transactionCategory: "PERCETAKAN", printingSubcategory: row.category, items: [] });
    add(amount, "Belum dicatat", [{ ...classification, amount }]);
  }
  return {
    date: input.date, total: totalCents / 100, outstandingDp: outstandingDpCents / 100,
    categories: [...categories].map(([category, cents]) => ({ category, amount: cents / 100 })).sort((a, b) => a.category.localeCompare(b.category)),
    subcategories: [...subcategories.values()].sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory)),
    paymentMethods: [...methods].map(([method, cents]) => ({ method, amount: cents / 100 })).sort((a, b) => a.method.localeCompare(b.method)),
  };
}
