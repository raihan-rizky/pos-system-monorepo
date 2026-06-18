import type { NormalizedImportRow } from "../types";
import type { ImportRowDecision } from "../types";

export type ProductImportCommitAction =
  | "create"
  | "skip"
  | "update"
  | "update-price"
  | "create-variant";

export function getCommitActionForResolvedRow(
  row: NormalizedImportRow,
  decision?: ImportRowDecision,
): ProductImportCommitAction {
  if (row.autoAction === "conflict") {
    if (decision === "create") return "create";
    if (decision === "create-variant") return "create-variant";
    if (decision === "skip") return "skip";
    throw new Error(`ROW_CONFLICT:${row.rowNumber}`);
  }

  if (decision === "skip") return "skip";
  if (decision === "update") return "update";
  if (row.autoAction === "auto_skip") return "skip";
  if (row.autoAction === "auto_price_update") return "update-price";
  if (row.autoAction === "auto_create_variant") return "create-variant";

  return "create";
}
