const DATE_PATTERN = /^\d{8}$/;
const PNW_DRAFT_PATTERN = /^PNW-TLD-(\d{4})(\d{2})(\d{2})-(\d+)$/;
const ROMAN_MONTHS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
] as const;

export function buildDraftNumber(date: string, count: number): string {
  if (!DATE_PATTERN.test(date)) {
    throw new Error(`buildDraftNumber: date must be YYYYMMDD, got "${date}"`);
  }
  if (count < 0 || !Number.isInteger(count)) {
    throw new Error(`buildDraftNumber: count must be a non-negative integer, got ${count}`);
  }
  return `PNW-TLD-${date}-${String(count).padStart(3, "0")}`;
}

export function formatDraftNumberForDisplay(value: string | null | undefined): string {
  if (!value) return "";

  const match = PNW_DRAFT_PATTERN.exec(value);
  if (!match) return value;

  const [, year, month, day, sequence] = match;
  const monthIndex = Number(month) - 1;
  const romanMonth = ROMAN_MONTHS[monthIndex];
  if (!romanMonth) return value;

  return `${sequence.padStart(3, "0")}/PNW-TLD/${day}/${romanMonth}/${year}`;
}
