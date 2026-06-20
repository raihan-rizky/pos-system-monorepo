import type { NormalizedImportRow } from "../types";

export function normalizeImportSearchQuery(value: string): string {
  return value.trim().toLowerCase();
}

export function rowMatchesProductImportSearch(
  row: NormalizedImportRow,
  query: string,
): boolean {
  const normalizedQuery = normalizeImportSearchQuery(query);
  if (!normalizedQuery) return true;

  return (
    row.name.toLowerCase().includes(normalizedQuery) ||
    row.sku.toLowerCase().includes(normalizedQuery)
  );
}

export function filterRowsByProductImportSearch(
  rows: NormalizedImportRow[],
  query: string,
): NormalizedImportRow[] {
  const normalizedQuery = normalizeImportSearchQuery(query);
  if (!normalizedQuery) return rows;
  return rows.filter((row) => rowMatchesProductImportSearch(row, normalizedQuery));
}
