"use client";

import type { ColumnMapping, ImportColumn } from "../types";
import { IMPORT_COLUMNS, REQUIRED_IMPORT_COLUMNS } from "../types";

const HEADER_ALIASES: Record<string, string> = {
  nama: "name",
  namacustomer: "name",
  nama_customer: "name",
  pelanggan: "name",
  customer: "name",
  nohp: "phone",
  nomorhp: "phone",
  no_wa: "phone",
  nowa: "phone",
  whatsapp: "phone",
  no_whatsapp: "phone",
  telepon: "phone",
  telp: "phone",
  perusahaan: "company",
  instansi: "company",
  alamat: "address",
  tipe: "type",
  jenis: "type",
  catatan: "notes",
};

function normalizeHeaderKey(value: string): string {
  const compact = value.replace(/[\s-]+/g, "_");
  return compact.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

export async function readFileHeaders(file: File): Promise<string[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });
  return (matrix[0] ?? [])
    .map((header) => String(header ?? "").trim())
    .filter(Boolean);
}

export function buildAutoMapping(rawHeaders: string[]): ColumnMapping {
  const known = new Set<ImportColumn>(IMPORT_COLUMNS);
  const mapping: ColumnMapping = {};
  const alreadyMapped = new Set<ImportColumn>();

  for (const raw of rawHeaders) {
    const key = normalizeHeaderKey(raw);
    const aliased = HEADER_ALIASES[key] ?? key;

    const column = aliased as ImportColumn;

    if (known.has(column) && !alreadyMapped.has(column)) {
      mapping[raw] = column;
      alreadyMapped.add(column);
    } else {
      mapping[raw] = "";
    }
  }

  return mapping;
}

export function getMissingRequiredColumns(mapping: ColumnMapping): string[] {
  const mapped = new Set<ImportColumn>(
    Object.values(mapping).filter((value): value is ImportColumn => Boolean(value)),
  );
  return REQUIRED_IMPORT_COLUMNS.filter((column) => !mapped.has(column));
}
