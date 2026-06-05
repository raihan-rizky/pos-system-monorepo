import type { InternalUseRecapPeriod, InternalUseRecapRange } from "../types";

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function localPartsFromIsoDate(value: string): LocalDateParts | null {
  if (!ISO_DATE_RE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function jakartaLocalMidnightUtc(parts: LocalDateParts): Date {
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day) - JAKARTA_OFFSET_MS,
  );
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function jakartaIsoDate(date: Date): string {
  const local = new Date(date.getTime() + JAKARTA_OFFSET_MS);
  return [
    local.getUTCFullYear(),
    pad(local.getUTCMonth() + 1),
    pad(local.getUTCDate()),
  ].join("-");
}

function formatRangeLabel(start: Date, endExclusive: Date): string {
  const endInclusive = addUtcDays(endExclusive, -1);
  const formatter = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
  const startLabel = formatter.format(start);
  const endLabel = formatter.format(endInclusive);
  return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
}

export function todayJakartaIsoDate(now = new Date()): string {
  return jakartaIsoDate(now);
}

export function resolveInternalUsePeriodRange(
  period: InternalUseRecapPeriod,
  anchorDate: string,
): { startDate: Date; endDate: Date; range: InternalUseRecapRange } | null {
  const parts = localPartsFromIsoDate(anchorDate);
  if (!parts) return null;

  const anchorStart = jakartaLocalMidnightUtc(parts);
  let startDate = anchorStart;
  let endDate = addUtcDays(anchorStart, 1);

  if (period === "weekly") {
    const localNoon = new Date(anchorStart.getTime() + JAKARTA_OFFSET_MS + 12 * 60 * 60 * 1000);
    const day = localNoon.getUTCDay();
    const daysSinceMonday = (day + 6) % 7;
    startDate = addUtcDays(anchorStart, -daysSinceMonday);
    endDate = addUtcDays(startDate, 7);
  }

  if (period === "monthly") {
    startDate = jakartaLocalMidnightUtc({
      year: parts.year,
      month: parts.month,
      day: 1,
    });
    endDate = addUtcMonths(startDate, 1);
  }

  return {
    startDate,
    endDate,
    range: {
      start: jakartaIsoDate(startDate),
      end: jakartaIsoDate(addUtcDays(endDate, -1)),
      label: formatRangeLabel(startDate, endDate),
    },
  };
}
