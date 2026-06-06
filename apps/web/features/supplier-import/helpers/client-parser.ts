"use client";

import type { ColumnMapping, ImportColumn } from "../types";
import { IMPORT_COLUMNS, REQUIRED_IMPORT_COLUMNS } from "../types";

const HEADER_ALIASES: Record<string, string> = {
  nama: "name",
  namasupplier: "name",
  nama_supplier: "name",
  supplier: "name",
  pemasok: "name",
  vendor: "name",
  tipe: "type",
  jenis: "type",
  kategori: "type",
  nohp: "phone",
  nomorhp: "phone",
  telepon: "phone",
  telp: "phone",
  kontak: "contactPerson",
  contact: "contactPerson",
  contact_person: "contactPerson",
  pic: "contactPerson",
  alamat: "address",
  catatan: "notes",
  note: "notes",
  keterangan: "notes",
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
    Object.values(mapping).filter((value): value is ImportColumn =>
      Boolean(value),
    ),
  );
  return REQUIRED_IMPORT_COLUMNS.filter((column) => !mapped.has(column));
}
