import { parseSpreadsheetMatrix } from "@/lib/server/spreadsheet-parser";

import {
  normalizeBulkStockHeader,
  type BulkStockColumnMapping,
} from "./import-core";

function normalizeValue(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export async function parseBulkStockImportFile(
  buffer: ArrayBuffer,
  columnMapping?: BulkStockColumnMapping,
) {
  const matrix = await parseSpreadsheetMatrix(buffer, {
    raw: true,
    rawNumbers: false,
  });
  const rawHeaders = (matrix[0] ?? []).map((header) =>
    String(header ?? "").trim(),
  );
  const headers = rawHeaders.map((rawHeader) => {
    if (columnMapping && rawHeader in columnMapping) {
      return columnMapping[rawHeader] || "";
    }
    return normalizeBulkStockHeader(rawHeader);
  });
  const records = matrix
    .slice(1)
    .filter((row) => row.some((cell) => normalizeValue(cell)))
    .map((row) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (header) record[header] = row[index];
      });
      return record;
    });

  return { headers: headers.filter(Boolean), records };
}
