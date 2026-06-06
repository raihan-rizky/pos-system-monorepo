import type {
  ImportRowDecision,
  NormalizedSupplierImportRow,
} from "../types";

export function getRowsMissingImportDecision(
  rows: NormalizedSupplierImportRow[],
  decisions: Record<string, ImportRowDecision>,
  selectedExistingSupplierIds: Record<string, string>,
): NormalizedSupplierImportRow[] {
  return rows.filter((row) => {
    if (row.errors.length > 0) return false;
    const decision = decisions[String(row.rowNumber)];
    if (!decision) {
      return row.duplicateInFile || row.existingMatches.length > 0;
    }
    if (decision !== "update") return false;
    return (
      row.existingMatches.length > 1 &&
      !selectedExistingSupplierIds[String(row.rowNumber)]
    );
  });
}
