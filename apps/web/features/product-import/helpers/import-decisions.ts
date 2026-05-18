import type { ImportRowDecision, NormalizedImportRow } from "../types";

export type ImportDecisionMap = Record<string, ImportRowDecision>;

export function getRowsMissingImportDecision(
  rows: NormalizedImportRow[],
  decisions: ImportDecisionMap,
) {
  return rows.filter((row) => {
    const requiresDecision = Boolean(row.existingProductId) || row.duplicateInFile;
    const decision = decisions[String(row.rowNumber)] ?? decisions[row.sku];

    return requiresDecision && !decision;
  });
}
