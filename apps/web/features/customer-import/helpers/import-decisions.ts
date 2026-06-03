import type {
  ImportRowDecision,
  NormalizedImportRow,
} from "../types";

export function getRowsMissingImportDecision(
  rows: NormalizedImportRow[],
  decisions: Record<string, ImportRowDecision>,
) {
  return rows.filter((row) => {
    if (!row.duplicateInFile && !row.existingCustomerId) return false;
    return !decisions[String(row.rowNumber)];
  });
}

