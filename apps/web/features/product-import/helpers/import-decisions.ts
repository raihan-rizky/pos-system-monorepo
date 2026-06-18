import type { ImportRowDecision, NormalizedImportRow } from "../types";

export type ImportDecisionMap = Record<string, ImportRowDecision>;

export function getDefaultDecisionForAutoAction(
  row: NormalizedImportRow,
): ImportRowDecision | undefined {
  if (row.autoAction === "auto_create_variant") return "create";
  if (row.autoAction === "auto_price_update") return "update";
  if (row.autoAction === "auto_skip") return "skip";
  return undefined;
}

export function getEffectiveImportDecision(
  row: NormalizedImportRow,
  decisions: ImportDecisionMap,
): ImportRowDecision | undefined {
  return (
    decisions[String(row.rowNumber)] ??
    decisions[row.sku] ??
    getDefaultDecisionForAutoAction(row)
  );
}

export function getRowsMissingImportDecision(
  rows: NormalizedImportRow[],
  decisions: ImportDecisionMap,
) {
  return rows.filter((row) => {
    const requiresDecision =
      Boolean(row.existingProductId) ||
      row.duplicateInFile ||
      row.autoAction === "conflict";
    const decision = getEffectiveImportDecision(row, decisions);

    return requiresDecision && !decision;
  });
}
