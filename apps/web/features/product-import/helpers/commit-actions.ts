import type { NormalizedImportRow } from "../types";

export type ProductImportCommitAction =
  | "create"
  | "skip"
  | "update-price"
  | "create-variant";

export function getCommitActionForResolvedRow(
  row: NormalizedImportRow,
): ProductImportCommitAction {
  if (row.autoAction === "conflict") {
    throw new Error(`ROW_CONFLICT:${row.rowNumber}`);
  }

  if (row.autoAction === "auto_skip") return "skip";
  if (row.autoAction === "auto_price_update") return "update-price";
  if (row.autoAction === "auto_create_variant") return "create-variant";

  return "create";
}
