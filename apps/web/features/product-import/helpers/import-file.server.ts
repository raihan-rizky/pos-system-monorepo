import { parseSpreadsheetMatrix } from "@/lib/server/spreadsheet-parser";

import type { ColumnMapping } from "../types";
import { getColumnMappingKey } from "./column-mapping-key";
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
  const rawHeaders = (matrix[0] ?? []).map((header) =>
    String(header ?? "").trim(),
  );

  const mappedColumns = new Set<string>();
  const normalizedHeaders = rawHeaders.map((rawHeader, index) => {
    const mappingKey = getColumnMappingKey(rawHeaders, index);
    let header = "";

    if (
      columnMapping &&
      mappingKey &&
      Object.prototype.hasOwnProperty.call(columnMapping, mappingKey)
    ) {
      header = columnMapping[mappingKey] || "";
    } else if (
      columnMapping &&
      mappingKey === rawHeader &&
      Object.prototype.hasOwnProperty.call(columnMapping, rawHeader)
    ) {
      header = columnMapping[rawHeader] || "";
    } else {
      header = normalizeHeader(rawHeader);
    }

    if (!header || mappedColumns.has(header)) return "";
    mappedColumns.add(header);
    return header;
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
