import type { ImportRowDecision, NormalizedImportRow } from "../types";
import { collapseWhitespace, normalizeProductDuplicateKey } from "./name-normalization";

export interface SameUnitPriceConflictPrice {
  rowNumber: number;
  price: number;
  costPrice: number | null;
  hargaDinas: number | null;
}

export interface SameUnitPriceConflictGroup {
  key: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  rowNumbers: number[];
  prices: SameUnitPriceConflictPrice[];
  resolution: string;
}

export interface SameUnitPriceConflictValidation {
  ok: boolean;
  conflictGroups: SameUnitPriceConflictGroup[];
}

export const SAME_UNIT_PRICE_CONFLICT_RESOLUTION =
  "Choose at most one update and skip the rest.";

export const SAME_UNIT_PRICE_CONFLICT_MESSAGE =
  "Import contains same-unit price conflicts. Choose at most one update and skip the rest.";

function normalizeUnit(value: string) {
  return collapseWhitespace(value).toLowerCase();
}

function priceValue(value: number | null | undefined) {
  return value == null ? null : Number(value);
}

function buildConflictKey(row: NormalizedImportRow) {
  return [
    row.sku.trim(),
    normalizeProductDuplicateKey({ name: row.name, category: row.category }),
    normalizeUnit(row.unit),
  ].join("|");
}

function buildPriceSignature(row: NormalizedImportRow) {
  return JSON.stringify({
    price: priceValue(row.price),
    costPrice: priceValue(row.costPrice),
    hargaDinas: priceValue(row.hargaDinas),
  });
}

function toPrice(row: NormalizedImportRow): SameUnitPriceConflictPrice {
  return {
    rowNumber: row.rowNumber,
    price: Number(row.price),
    costPrice: priceValue(row.costPrice),
    hargaDinas: priceValue(row.hargaDinas),
  };
}

export function findSameUnitPriceConflictGroups(
  rows: NormalizedImportRow[],
): SameUnitPriceConflictGroup[] {
  const rowsByKey = new Map<string, NormalizedImportRow[]>();

  for (const row of rows) {
    if (!row.sku.trim()) continue;
    const key = buildConflictKey(row);
    rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), row]);
  }

  const groups: SameUnitPriceConflictGroup[] = [];
  for (const [key, groupRows] of rowsByKey) {
    if (groupRows.length < 2) continue;
    const priceSignatures = new Set(groupRows.map(buildPriceSignature));
    if (priceSignatures.size < 2) continue;

    const first = groupRows[0];
    groups.push({
      key,
      sku: first.sku,
      name: first.name,
      category: first.category,
      unit: first.unit,
      rowNumbers: groupRows.map((row) => row.rowNumber),
      prices: groupRows.map(toPrice),
      resolution: SAME_UNIT_PRICE_CONFLICT_RESOLUTION,
    });
  }

  return groups;
}

export function applySameUnitPriceConflicts(
  rows: NormalizedImportRow[],
): NormalizedImportRow[] {
  const groups = findSameUnitPriceConflictGroups(rows);
  if (groups.length === 0) return rows;

  const rowsInConflict = new Set(groups.flatMap((group) => group.rowNumbers));
  const error = "Same SKU/product/unit has conflicting price data. Choose one update or skip rows.";

  return rows.map((row) => {
    if (!rowsInConflict.has(row.rowNumber)) return row;
    return {
      ...row,
      autoAction: "same_unit_price_conflict",
      autoActionReason: error,
      errors: Array.from(new Set([...row.errors, error])),
    };
  });
}

export function validateSameUnitPriceConflictDecisions(
  rows: NormalizedImportRow[],
  decisions: Record<string, ImportRowDecision>,
): SameUnitPriceConflictValidation {
  const groups = findSameUnitPriceConflictGroups(rows);
  const invalidGroups = groups.filter((group) => {
    const groupDecisions = group.rowNumbers.map((rowNumber) => decisions[String(rowNumber)]);
    if (groupDecisions.some((decision) => !decision)) return true;
    if (groupDecisions.some((decision) => decision !== "update" && decision !== "skip")) {
      return true;
    }
    return groupDecisions.filter((decision) => decision === "update").length > 1;
  });

  return {
    ok: invalidGroups.length === 0,
    conflictGroups: invalidGroups,
  };
}
