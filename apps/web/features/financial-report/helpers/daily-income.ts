import { buildIncomePeriod } from "./income-period";
import type { IncomeClassificationInput, IncomeCategory, IncomeSubcategoryRow } from "./income-categories";

export { buildIncomePeriod } from "./income-period";

export const DAILY_INCOME_PERMISSIONS = {
  total: "financial-report.daily-income",
  outstandingDp: "financial-report.daily-outstanding-dp",
  categories: "financial-report.daily-category",
  subcategories: "financial-report.daily-subcategory",
  paymentMethods: "financial-report.daily-payment-method",
} as const;
export type DailyIncomeAccess = Record<keyof typeof DAILY_INCOME_PERMISSIONS, boolean> & { receivableBalance: boolean };
export function hasDailyReceivableAccess(canRead: (target: string) => boolean): boolean {
  return ["transaction", "customer.receivable"].every(canRead);
}
type Payment = { id: string; method: string; amount: unknown; createdAt: Date };
export type DailyIncomeTransaction = IncomeClassificationInput & {
  id: string; createdAt: Date; invoiceDate?: Date; status: string; paymentMethod: string; total: unknown; amountPaid: unknown; change?: unknown;
  offlineSyncMetadata?: unknown;
  payments: Payment[];
  debtPaymentLogs: Array<{ id: string; paymentMethod: string; amount: unknown; createdAt: Date }>;
};
export type DailyManualIncome = { id: string; occurredAt: Date; category: string; amount: unknown; deletedAt?: Date | null; payments?: Array<{ method: string; amount: unknown }> };
export type DailyIncomeReport = {
  date: string; total: number;
  outstandingDp: number;
  categories: Array<{ category: IncomeCategory; amount: number }>;
  subcategories: IncomeSubcategoryRow[];
  paymentMethods: Array<{ method: string; amount: number }>;
};
export type DailyIncomeResponse = Pick<DailyIncomeReport, "date"> & Partial<Omit<DailyIncomeReport, "date">> & {
  viewMode?: "full";
  receivableBalance?: number;
  receiptHistoryAccess?: { total: boolean; category: boolean; subcategory: boolean; method: boolean; outstandingDp: boolean };
};

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

export function buildDailyIncome(input: { date: string; transactions: DailyIncomeTransaction[]; manualIncome: DailyManualIncome[] }): DailyIncomeReport {
  return buildIncomePeriod({ fromDate: input.date, toDate: input.date, transactions: input.transactions, manualIncome: input.manualIncome }).days[0];
}
