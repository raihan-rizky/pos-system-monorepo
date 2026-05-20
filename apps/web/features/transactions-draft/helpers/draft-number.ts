const DATE_PATTERN = /^\d{8}$/;

export function buildDraftNumber(date: string, count: number): string {
  if (!DATE_PATTERN.test(date)) {
    throw new Error(`buildDraftNumber: date must be YYYYMMDD, got "${date}"`);
  }
  if (count < 0 || !Number.isInteger(count)) {
    throw new Error(`buildDraftNumber: count must be a non-negative integer, got ${count}`);
  }
  return `DRAFT-${date}-${String(count).padStart(4, "0")}`;
}
