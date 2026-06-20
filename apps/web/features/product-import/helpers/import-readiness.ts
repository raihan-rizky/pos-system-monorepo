import type { ImportRowDecision, NormalizedImportRow } from "../types";
import { getCommitActionForResolvedRow } from "./commit-actions";
import {
  getEffectiveImportDecision,
  getRowsMissingImportDecision,
  type ImportDecisionMap,
} from "./import-decisions";
import { validateSameUnitPriceConflictDecisions } from "./same-unit-price-conflicts";

export interface DuplicateFinalSkuGroup {
  sku: string;
  rowNumbers: number[];
  keepRowNumber: number;
  skippedRowNumbers: number[];
}

export interface ProductImportReadiness {
  ok: boolean;
  notReadyRowNumbers: number[];
  blockersByRow: Record<number, string[]>;
  duplicateFinalSkuGroups: DuplicateFinalSkuGroup[];
  suggestedDecisions: Record<string, ImportRowDecision>;
}

const BLOCKING_ROW_ERROR = "Perbaiki error baris sebelum commit.";
const MISSING_DECISION_ERROR = "Pilih aksi sebelum commit.";
const SAME_UNIT_PRICE_ERROR =
  "Ada konflik harga untuk SKU dan satuan yang sama. Pilih satu update dan lewati sisanya.";
const DUPLICATE_FINAL_SKU_ERROR = "SKU aktif masih duplikat.";

function addBlocker(
  blockersByRow: Record<number, string[]>,
  rowNumber: number,
  blocker: string,
) {
  blockersByRow[rowNumber] = Array.from(
    new Set([...(blockersByRow[rowNumber] ?? []), blocker]),
  );
}

function optionalCompletenessScore(row: NormalizedImportRow): number {
  const values = [
    row.stockProvided ? row.stock : null,
    row.unitMultiplierToBase,
    row.costPrice,
    row.hargaDinas,
    row.minStock,
    row.barcode,
    row.description,
    row.size,
    row.material,
    row.imageUrl,
  ];

  return values.filter((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  }).length;
}

export function compareDuplicateFinalSkuRows(
  left: NormalizedImportRow,
  right: NormalizedImportRow,
): number {
  const completenessDelta =
    optionalCompletenessScore(right) - optionalCompletenessScore(left);
  if (completenessDelta !== 0) return completenessDelta;

  const priceDelta = Number(right.price) - Number(left.price);
  if (priceDelta !== 0) return priceDelta;

  return left.rowNumber - right.rowNumber;
}

function isActiveCommitRow(
  row: NormalizedImportRow,
  decisions: ImportDecisionMap,
): boolean {
  const decision = getEffectiveImportDecision(row, decisions);
  try {
    return getCommitActionForResolvedRow(row, decision) !== "skip";
  } catch {
    return true;
  }
}

export function findDuplicateFinalSkuGroups(
  rows: NormalizedImportRow[],
  decisions: ImportDecisionMap,
): DuplicateFinalSkuGroup[] {
  const rowsBySku = new Map<string, NormalizedImportRow[]>();

  for (const row of rows) {
    if (!row.sku.trim() || !isActiveCommitRow(row, decisions)) continue;
    rowsBySku.set(row.sku, [...(rowsBySku.get(row.sku) ?? []), row]);
  }

  return Array.from(rowsBySku.entries())
    .filter(([, groupRows]) => groupRows.length > 1)
    .map(([sku, groupRows]) => {
      const sortedRows = [...groupRows].sort(compareDuplicateFinalSkuRows);
      const keepRowNumber = sortedRows[0].rowNumber;
      const skippedRowNumbers = sortedRows.slice(1).map((row) => row.rowNumber);

      return {
        sku,
        rowNumbers: groupRows.map((row) => row.rowNumber),
        keepRowNumber,
        skippedRowNumbers,
      };
    });
}

export function getSuggestedDuplicateFinalSkuDecisions(
  rows: NormalizedImportRow[],
  decisions: ImportDecisionMap,
): Record<string, ImportRowDecision> {
  const suggestions: Record<string, ImportRowDecision> = {};

  for (const group of findDuplicateFinalSkuGroups(rows, decisions)) {
    for (const rowNumber of group.skippedRowNumbers) {
      const key = String(rowNumber);
      if (!decisions[key]) suggestions[key] = "skip";
    }
  }

  return suggestions;
}

export function getProductImportReadiness(
  rows: NormalizedImportRow[],
  decisions: ImportDecisionMap,
): ProductImportReadiness {
  const blockersByRow: Record<number, string[]> = {};
  const suggestedDecisions = getSuggestedDuplicateFinalSkuDecisions(rows, decisions);

  for (const row of rows) {
    const decision = getEffectiveImportDecision(row, decisions);
    if (
      row.errors.length > 0 &&
      !(row.autoAction === "same_unit_price_conflict" && decision)
    ) {
      addBlocker(blockersByRow, row.rowNumber, BLOCKING_ROW_ERROR);
    }
  }

  for (const row of getRowsMissingImportDecision(rows, decisions)) {
    addBlocker(blockersByRow, row.rowNumber, MISSING_DECISION_ERROR);
  }

  const sameUnitPriceValidation = validateSameUnitPriceConflictDecisions(rows, decisions);
  for (const group of sameUnitPriceValidation.conflictGroups) {
    for (const rowNumber of group.rowNumbers) {
      addBlocker(blockersByRow, rowNumber, SAME_UNIT_PRICE_ERROR);
    }
  }

  const duplicateFinalSkuGroups = findDuplicateFinalSkuGroups(rows, decisions);
  for (const group of duplicateFinalSkuGroups) {
    for (const rowNumber of group.rowNumbers) {
      addBlocker(blockersByRow, rowNumber, DUPLICATE_FINAL_SKU_ERROR);
    }
  }

  const notReadyRowNumbers = Object.keys(blockersByRow)
    .map(Number)
    .sort((left, right) => left - right);

  return {
    ok: notReadyRowNumbers.length === 0,
    notReadyRowNumbers,
    blockersByRow,
    duplicateFinalSkuGroups,
    suggestedDecisions,
  };
}
