import { parseSpreadsheetMatrix } from "@/lib/server/spreadsheet-parser";

import type { ColumnMapping } from "../types";
import { normalizeHeader } from "./import-core";

function normalizeValue(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

async function parseWorkbookRows(
  buffer: ArrayBuffer,
  columnMapping?: ColumnMapping,
) {
  const matrix = await parseSpreadsheetMatrix(buffer);
  const rawHeaders = (matrix[0] ?? [])
    .map((header) => String(header ?? "").trim())
    .filter(Boolean);

  const normalizedHeaders = rawHeaders.map((rawHeader) => {
    if (columnMapping && rawHeader in columnMapping) {
      return columnMapping[rawHeader] || "";
    }
    return normalizeHeader(rawHeader);
  });

  const records = matrix
    .slice(1)
    .filter((row) => row.some((cell) => normalizeValue(cell)))
    .map((row) => {
      const record: Record<string, unknown> = {};
      normalizedHeaders.forEach((header, index) => {
        if (header) record[header] = row[index];
      });
      return record;
    });

  return { headers: normalizedHeaders.filter(Boolean), records };
}

export async function extractRawHeaders(buffer: ArrayBuffer): Promise<string[]> {
  const matrix = await parseSpreadsheetMatrix(buffer);
  return (matrix[0] ?? [])
    .map((header) => String(header ?? "").trim())
    .filter(Boolean);
}

export function parseImportFile(
  buffer: ArrayBuffer,
  columnMapping?: ColumnMapping,
) {
  return parseWorkbookRows(buffer, columnMapping);
}
