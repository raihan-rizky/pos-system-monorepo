import { buildDailyIncomeRange } from "@/features/financial-report/helpers/daily-income";
import { buildTransactionHistoryQuickDateRange, type TransactionHistoryQuickDateFilter } from "./date-range";
import type { ReceiptHistoryData } from "../hooks/useReceiptHistory";

export type ReceiptKind = "all" | "nota" | "receivable-nota" | "manual-income" | "manual-receivable" | "supplier-refund";

export function selectReceiptRows(data: ReceiptHistoryData, kind: ReceiptKind) {
  return {
    items: data.items.filter(item => kind === "all" || (item.isReceivableNota ? kind === "receivable-nota" : kind === "nota")),
    manualEntries: kind === "all" || kind === "manual-income" ? data.manualEntries ?? [] : [],
    manualReceivableEntries: kind === "all" || kind === "manual-receivable" ? data.manualReceivableEntries ?? [] : [],
    ...(data.supplierRefundEntries?.length ? {
      supplierRefundEntries: kind === "all" || kind === "supplier-refund" ? data.supplierRefundEntries : [],
    } : {}),
  };
}

export function summarizeReceiptRows(rows: ReturnType<typeof selectReceiptRows>) {
  const groups = [
    { kind: "nota" as const, label: "Nota", rows: rows.items.filter(item => !item.isReceivableNota) },
    { kind: "receivable-nota" as const, label: "Piutang Nota", rows: rows.items.filter(item => item.isReceivableNota) },
    { kind: "manual-income" as const, label: "Pemasukan Manual", rows: rows.manualEntries },
    { kind: "manual-receivable" as const, label: "Piutang Manual", rows: rows.manualReceivableEntries },
    ...(rows.supplierRefundEntries?.length ? [{ kind: "supplier-refund" as const, label: "Pengembalian dana pemasok", rows: rows.supplierRefundEntries }] : []),
  ].map(group => ({ kind: group.kind, label: group.label, count: group.rows.length,
    amount: group.rows.reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100 }));
  const totalCents = groups.reduce((sum, group) => sum + Math.round(group.amount * 100), 0);
  return groups.map(group => ({ ...group, percent: totalCents ? Math.round(Math.round(group.amount * 100) / totalCents * 1000) / 10 : 0 }));
}

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
    || (category !== undefined && (typeof category !== "string" || !["ATK", "Percetakan", "Belum ditentukan", "Piutang Manual", "Lainnya"].includes(category)))
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
