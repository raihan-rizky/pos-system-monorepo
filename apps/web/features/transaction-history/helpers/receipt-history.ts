import { buildDailyIncomeRange } from "@/features/financial-report/helpers/daily-income";
import { buildTransactionHistoryQuickDateRange, type TransactionHistoryQuickDateFilter } from "./date-range";

export type ReceiptHistoryContext = {
  date: string;
  mode: "receipt" | "outstanding-dp";
  category?: string;
  subcategory?: string;
  method?: string;
  previewSales?: boolean;
  period?: TransactionHistoryQuickDateFilter;
};

export function buildReceiptHistoryUrl(context: ReceiptHistoryContext): string {
  const params = new URLSearchParams({ mode: context.mode, date: context.date });
  if (context.category) params.set("category", context.category);
  if (context.subcategory) params.set("subcategory", context.subcategory);
  if (context.method) params.set("method", context.method);
  if (context.previewSales) params.set("view", "sales");
  if (context.period && context.period !== "daily") params.set("period", context.period);
  return `/history?${params.toString()}`;
}

export function parseReceiptHistoryParams(params: Record<string, string | string[] | undefined>):
  | { status: "none" | "invalid" }
  | ({ status: "valid" } & ReceiptHistoryContext) {
  if (params.mode === undefined) return { status: "none" };
  const { mode, date, category, subcategory, method, view, period } = params;
  if ((mode !== "receipt" && mode !== "outstanding-dp") || typeof date !== "string"
    || (category !== undefined && category !== "ATK" && category !== "Percetakan")
    || (subcategory !== undefined && (typeof subcategory !== "string" || !category || !subcategory.trim() || subcategory.length > 150))
    || (method !== undefined && (typeof method !== "string" || !["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER", "Belum dicatat"].includes(method)))
    || (view !== undefined && view !== "sales")
    || (period !== undefined && period !== "daily" && period !== "weekly" && period !== "monthly")
    || (mode === "outstanding-dp" && (category || subcategory || method))) return { status: "invalid" };
  try { buildDailyIncomeRange(date); } catch { return { status: "invalid" }; }
  return { status: "valid", mode, date, ...(category && { category }), ...(subcategory && { subcategory }),
    ...(method && { method }), ...(view === "sales" && { previewSales: true }), ...(period && { period }) };
}

export function receiptHistoryRange(date: string, period: TransactionHistoryQuickDateFilter) {
  return buildTransactionHistoryQuickDateRange(period, new Date(`${date}T12:00:00+07:00`));
}
