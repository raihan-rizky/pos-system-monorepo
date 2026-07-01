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
  pendingSuratJalan?: number;
  unmarkedSuratJalan?: number;
}

export type OutLogVerificationState =
  | "UNVERIFIED"
  | "VERIFIED"
  | "MISMATCH"
  | "CORRECTION_PENDING"
  | "CORRECTION_REJECTED"
  | "READY_FOR_REVIEW";

export const OUT_LOG_VERIFICATION_REASONS = [
  "USAGE",
  "MANUAL_ADJUSTMENT",
] as const;

const OUT_LOG_VERIFICATION_REASON_SET = new Set<string>(
  OUT_LOG_VERIFICATION_REASONS,
);

export function isOutLogVerificationEligible(input: {
  type: string | null;
  status: string | null;
  reason: string | null;
}): boolean {
  return (
    input.type === "OUT" &&
    input.status === "APPROVED" &&
    input.reason !== null &&
    OUT_LOG_VERIFICATION_REASON_SET.has(input.reason)
  );
}

export function resolveOutLogVerificationState(input: {
  verificationStatus: "UNVERIFIED" | "VERIFIED" | "MISMATCH" | null;
  correctionStatus: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | null;
}): OutLogVerificationState {
  if (
    input.verificationStatus === "MISMATCH" &&
    input.correctionStatus === "PENDING"
  ) {
    return "CORRECTION_PENDING";
  }
  if (
    input.verificationStatus === "MISMATCH" &&
    input.correctionStatus === "REJECTED"
  ) {
    return "CORRECTION_REJECTED";
  }
  if (
    input.verificationStatus === "MISMATCH" &&
    input.correctionStatus === "APPROVED"
  ) {
    return "READY_FOR_REVIEW";
  }

  return input.verificationStatus ?? "UNVERIFIED";
}

export interface OutLogCorrectionMovement {
  productId: string;
  delta: number;
  kind: "NET" | "REVERSAL" | "REPLACEMENT";
}

export function calculateOutLogCorrectionMovements(input: {
  originalProductId: string;
  originalQuantity: number;
  correctedProductId: string;
  correctedQuantity: number;
}): OutLogCorrectionMovement[] {
  if (input.originalProductId === input.correctedProductId) {
    const delta = input.originalQuantity - input.correctedQuantity;
    return delta === 0
      ? []
      : [{ productId: input.originalProductId, delta, kind: "NET" }];
  }

  return [
    {
      productId: input.originalProductId,
      delta: input.originalQuantity,
      kind: "REVERSAL",
    },
    {
      productId: input.correctedProductId,
      delta: -input.correctedQuantity,
      kind: "REPLACEMENT",
    },
  ];
}

export function unresolvedOutLogVerificationWhere() {
  return {
    AND: [
      { OR: [{ reason: "USAGE" as const }, { reason: "MANUAL_ADJUSTMENT" as const }] },
      {
        OR: [
          { verification: null },
          {
            verification: {
              status: { in: ["UNVERIFIED" as const, "MISMATCH" as const] },
            },
          },
        ],
      },
    ],
  };
}

export const DAILY_MATCHING_WINDOW_LABEL = "15:00-20:00 WIB";

const DAILY_MATCHING_START_SECONDS = 15 * 60 * 60;
const DAILY_MATCHING_END_SECONDS = 20 * 60 * 60;

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

export function isJakartaSaturday(date: Date): boolean {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
  }).format(date) === "Sat";
}

function jakartaSecondsSinceMidnight(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const second = Number(parts.find((part) => part.type === "second")?.value ?? 0);

  return hour * 60 * 60 + minute * 60 + second;
}

export function isDailyMatchingWindowOpen(date: Date = new Date()): boolean {
  const seconds = jakartaSecondsSinceMidnight(date);
  return (
    seconds >= DAILY_MATCHING_START_SECONDS &&
    seconds <= DAILY_MATCHING_END_SECONDS
  );
}

export function getDailyMatchingWindowStatus(date: Date = new Date()) {
  const seconds = jakartaSecondsSinceMidnight(date);
  const isOpen =
    seconds >= DAILY_MATCHING_START_SECONDS &&
    seconds <= DAILY_MATCHING_END_SECONDS;

  return {
    isOpen,
    label: DAILY_MATCHING_WINDOW_LABEL,
    badgeLabel: isOpen
      ? "Sedang dibuka"
      : seconds < DAILY_MATCHING_START_SECONDS
        ? "Buka 15:00 WIB"
        : "Tutup 20:00 WIB",
    message: isOpen
      ? "Matching stok harian sedang bisa dikerjakan."
      : `Matching stok harian hanya dibuka pukul ${DAILY_MATCHING_WINDOW_LABEL}.`,
  };
}

export function buildInventoryUrgentCount(
  role: Role,
  counts: InventoryUrgentCounts,
): number {
  if (role === "OWNER") {
    return (
      counts.pendingStockRequests +
      counts.submittedInboundReceipts +
      (counts.pendingSuratJalan ?? 0) +
      counts.damagedReportsPending
    );
  }

  const operationalCount =
    counts.unverifiedOutLogs +
    (counts.weeklyProofMissing ? 1 : 0) +
    (counts.dailyMatchingIncomplete ? 1 : 0) +
    counts.needsRevisionReceipts +
    counts.rejectedOwnRequests +
    (counts.unmarkedSuratJalan ?? 0);

  if (role === "INVENTORY" || role === "ADMIN") return operationalCount;

  return 0;
}
