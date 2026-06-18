import type { NormalizedImportRow } from "../types";
import type { ImportRowDecision } from "../types";

export type ProductImportCommitAction =
  | "create"
  | "skip"
  | "update-price"
  | "create-variant";

export function getCommitActionForResolvedRow(
  row: NormalizedImportRow,
  decision?: ImportRowDecision,
): ProductImportCommitAction {
  if (row.autoAction === "conflict") {
    throw new Error(`ROW_CONFLICT:${row.rowNumber}`);
  }

  if (decision === "skip") return "skip";
  if (row.autoAction === "auto_skip") return "skip";
  if (row.autoAction === "auto_price_update") return "update-price";
  if (row.autoAction === "auto_create_variant") return "create-variant";

  return "create";
}
