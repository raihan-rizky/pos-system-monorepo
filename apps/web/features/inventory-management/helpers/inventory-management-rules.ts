import type { Role } from "@/features/rbac/helpers/rbac-core";

export type StockTaskKind =
  | "NEGATIVE_STOCK"
  | "OUT_OF_STOCK"
  | "LOW_STOCK"
  | "HEALTHY";

export interface StockTaskInput {
  stock: number;
  minStock: number;
}

export interface InventoryUrgentCounts {
  pendingStockRequests: number;
  unverifiedOutLogs: number;
  submittedInboundReceipts: number;
  weeklyProofMissing: boolean;
  dailyMatchingIncomplete: boolean;
  damagedReportsPending: number;
  needsRevisionReceipts: number;
  rejectedOwnRequests: number;
}

export function classifyStockTask(input: StockTaskInput): StockTaskKind {
  if (input.stock < 0) return "NEGATIVE_STOCK";
  if (input.stock === 0) return "OUT_OF_STOCK";
  if (input.stock <= input.minStock) return "LOW_STOCK";
  return "HEALTHY";
}

export function jakartaDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export function jakartaWeekKey(date: Date): string {
  const [year, month, day] = jakartaDateKey(date).split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const weekYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const weekNumber = Math.ceil(
    ((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );

  return `${weekYear}-W${String(weekNumber).padStart(2, "0")}`;
}

export function buildInventoryUrgentCount(
  role: Role,
  counts: InventoryUrgentCounts,
): number {
  if (role === "OWNER") {
    return (
      counts.pendingStockRequests +
      counts.submittedInboundReceipts +
      counts.damagedReportsPending
    );
  }

  const operationalCount =
    counts.unverifiedOutLogs +
    (counts.weeklyProofMissing ? 1 : 0) +
    (counts.dailyMatchingIncomplete ? 1 : 0) +
    counts.needsRevisionReceipts +
    counts.rejectedOwnRequests;

  if (role === "INVENTORY" || role === "ADMIN") return operationalCount;

  return 0;
}
