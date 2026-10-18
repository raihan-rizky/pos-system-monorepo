import type { ChangeEntry } from "../types";

const DAY = 86_400_000;
const WIB_OFFSET = 7 * 60 * 60 * 1000;

function dateValue(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}

function todayWib(now: Date): number {
  return Math.floor((now.getTime() + WIB_OFFSET) / DAY) * DAY;
}

export function getPublishedChanges(entries: readonly ChangeEntry[], now = new Date()): ChangeEntry[] {
  const today = todayWib(now);
  return entries.filter(entry => dateValue(entry.date) <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getRecentChanges(entries: readonly ChangeEntry[], now = new Date()): ChangeEntry[] {
  const start = todayWib(now) - 6 * DAY;
  return getPublishedChanges(entries, now).filter(entry => dateValue(entry.date) >= start);
}

export function changeKey(entry: ChangeEntry): string {
  return `${entry.id}:${entry.revision}`;
}

export function getUnseenChanges(entries: readonly ChangeEntry[], seen: readonly string[], now = new Date()): ChangeEntry[] {
  const seenKeys = new Set(seen);
  return getRecentChanges(entries, now).filter(entry => !seenKeys.has(changeKey(entry)));
}

export function parseSeenChanges(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function formatChangeDate(date: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })
    .format(new Date(`${date}T00:00:00+07:00`));
}

export function seenStorageKey(userId: string): string {
  return `pos:changelog:seen:${userId}`;
}
