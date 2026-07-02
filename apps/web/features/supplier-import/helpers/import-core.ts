import { z } from "zod";
import { parseSpreadsheetMatrix } from "@/lib/server/spreadsheet-parser";

import {
  SUPPLIER_TYPES,
  type SupplierType,
} from "@/features/suppliers/types/supplier";
import { normalizeSupplierCode } from "@/features/suppliers/helpers/supplier-code";
import {
  IMPORT_COLUMNS,
  REQUIRED_IMPORT_COLUMNS,
  type ColumnMapping,
  type ExistingSupplierMatch,
  type SupplierImportPreviewResponse,
  type NormalizedSupplierImportRow,
} from "../types";

export const MAX_SUPPLIER_IMPORT_ROWS = 500;

const HEADER_ALIASES: Record<string, string> = {
  suppliercode: "supplierCode",
  supplier_code: "supplierCode",
  kodesupplier: "supplierCode",
  kode_supplier: "supplierCode",
  kodepemasok: "supplierCode",
  kode_pemasok: "supplierCode",
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
  phone_number: "phone",
  kontak: "contactPerson",
  contact: "contactPerson",
  contact_person: "contactPerson",
  pic: "contactPerson",
  penanggung_jawab: "contactPerson",
  alamat: "address",
  catatan: "notes",
  note: "notes",
  keterangan: "notes",
};

export const importRowCommitSchema = z.object({
  rowNumber: z.number().int().min(1),
  supplierCode: z.string().trim().nullable().optional(),
  name: z.string().trim().min(1),
  normalizedName: z.string().trim().min(1),
  type: z.enum(SUPPLIER_TYPES),
  phone: z.string().trim().nullable().optional(),
  contactPerson: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  duplicateInFile: z.boolean(),
  existingMatches: z.array(
    z.object({
      supplierId: z.string(),
      name: z.string(),
      code: z.string().nullable().optional(),
      type: z.enum(SUPPLIER_TYPES),
      phone: z.string().nullable(),
      isActive: z.boolean(),
    }),
  ),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});

export type SupplierImportCommitRow = z.infer<typeof importRowCommitSchema>;

export type ParsedSupplierImportRecord = {
  rowNumber: number;
  record: Record<string, unknown>;
};

export type ParsedSupplierImportFile = {
  headers: string[];
  records: ParsedSupplierImportRecord[];
  removedEmptyRowCount: number;
};

export function normalizeSupplierName(value: unknown): string {
  return normalizeValue(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function parseImportFile(
  buffer: ArrayBuffer,
  columnMapping?: ColumnMapping,
): Promise<ParsedSupplierImportFile> {
  return parseSupplierImportFile(buffer, columnMapping);
}

async function parseSupplierImportFile(
  buffer: ArrayBuffer,
  columnMapping?: ColumnMapping,
): Promise<ParsedSupplierImportFile> {
  const matrix = await parseSpreadsheetMatrix(buffer);
  const rawHeaders = (matrix[0] ?? [])
    .map((header) => String(header ?? "").trim())
    .filter(Boolean);
  const normalizedHeaders = rawHeaders.map((raw) => {
    if (columnMapping && raw in columnMapping) {
      return columnMapping[raw] || "";
    }
    return normalizeHeader(raw);
  });

  let removedEmptyRowCount = 0;
  const records: ParsedSupplierImportRecord[] = [];

  matrix.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const isEmpty = !row.some((cell) => normalizeValue(cell));
    if (isEmpty) {
      removedEmptyRowCount += 1;
      return;
    }

    const record: Record<string, unknown> = {};
    normalizedHeaders.forEach((header, cellIndex) => {
      if (header) record[header] = row[cellIndex];
    });
    records.push({ rowNumber, record });
  });

  return {
    headers: normalizedHeaders.filter(Boolean),
    records,
    removedEmptyRowCount,
  };
}

export function buildMissingColumnResponse(headers: string[]) {
  const knownColumns = new Set<string>(IMPORT_COLUMNS);
  const headerSet = new Set(headers);
  const missingColumns = REQUIRED_IMPORT_COLUMNS.filter(
    (column) => !headerSet.has(column),
  );
  const unknownColumns = headers.filter((column) => !knownColumns.has(column));
  const suggestions: Record<string, string> = {};

  for (const column of unknownColumns) {
    const normalized = normalizeHeader(column);
    if (knownColumns.has(normalized)) {
      suggestions[column] = normalized;
    }
  }

  return { missingColumns, unknownColumns, suggestions };
}

export function normalizeImportRows(
  parsedRecords: ParsedSupplierImportRecord[],
  existingSupplierMap: Map<string, ExistingSupplierMatch[]>,
  existingSupplierByCodeMap: Map<string, ExistingSupplierMatch> = new Map(),
): Pick<
  SupplierImportPreviewResponse,
  "rows" | "warnings" | "errors" | "existingNameMatches"
> {
  const nameCounts = new Map<string, number>();
  parsedRecords.forEach(({ record }) => {
    const normalizedName = normalizeSupplierName(record.name);
    if (normalizedName) {
      nameCounts.set(normalizedName, (nameCounts.get(normalizedName) ?? 0) + 1);
    }
  });

  const warnings: string[] = [];
  const errors: string[] = [];
  const existingNameMatches = new Map<
    string,
    { normalizedName: string; supplierId: string; name: string }
  >();

  const rows: NormalizedSupplierImportRow[] = parsedRecords
    .slice(0, MAX_SUPPLIER_IMPORT_ROWS)
    .map(({ rowNumber, record }) => {
      const rowWarnings: string[] = [];
      const rowErrors: string[] = [];
      const supplierCode = normalizeSupplierCode(record.supplierCode);
      const name = normalizeValue(record.name);
      const normalizedName = normalizeSupplierName(name);
      const typeResult = normalizeSupplierType(record.type);
      const nameMatches = normalizedName
        ? existingSupplierMap.get(normalizedName) ?? []
        : [];
      const codeMatch = supplierCode
        ? existingSupplierByCodeMap.get(supplierCode) ?? null
        : null;
      const nameMatchesCodeMatch =
        codeMatch && nameMatches.some((match) => match.supplierId === codeMatch.supplierId);
      const existingMatches = codeMatch
        ? nameMatches.length > 0
          ? nameMatchesCodeMatch
            ? [codeMatch]
            : []
          : [codeMatch]
        : nameMatches;

      if (!name) rowErrors.push("Name is required.");
      if (typeResult.warning) rowWarnings.push(typeResult.warning);
      if (codeMatch && nameMatches.length > 0 && !nameMatchesCodeMatch) {
        rowErrors.push(
          "Supplier code and name point to different suppliers. Fix the code or name before commit.",
        );
      }

      const duplicateInFile =
        normalizedName ? (nameCounts.get(normalizedName) ?? 0) > 1 : false;
      if (duplicateInFile) {
        rowWarnings.push(
          "Duplicate supplier name in file. Keep one active row and skip the rest.",
        );
      }

      if (existingMatches.length === 1) {
        rowWarnings.push(
          "Supplier name already exists. Choose update or skip before commit.",
        );
      } else if (existingMatches.length > 1) {
        rowWarnings.push(
          "Multiple suppliers match this name. Choose one existing supplier or skip.",
        );
      }

      for (const match of existingMatches) {
        existingNameMatches.set(`${normalizedName}:${match.supplierId}`, {
          normalizedName,
          supplierId: match.supplierId,
          name: match.name,
        });
      }

      rowWarnings.forEach((warning) =>
        warnings.push(`Row ${rowNumber}: ${warning}`),
      );
      rowErrors.forEach((error) => errors.push(`Row ${rowNumber}: ${error}`));

      return {
        rowNumber,
        supplierCode,
        name,
        normalizedName,
        type: typeResult.type,
        phone: normalizeOptional(record.phone),
        contactPerson: normalizeOptional(record.contactPerson),
        address: normalizeOptional(record.address),
        notes: normalizeOptional(record.notes),
        duplicateInFile,
        existingMatches,
        warnings: rowWarnings,
        errors: rowErrors,
      };
    });

  if (parsedRecords.length > MAX_SUPPLIER_IMPORT_ROWS) {
    errors.push(
      `Import files are limited to ${MAX_SUPPLIER_IMPORT_ROWS} non-empty rows.`,
    );
  }

  return {
    rows,
    warnings,
    errors,
    existingNameMatches: Array.from(existingNameMatches.values()),
  };
}

function normalizeSupplierType(rawType: unknown): {
  type: SupplierType;
  warning: string | null;
} {
  const value = normalizeValue(rawType);
  if (!value) {
    return {
      type: "OTHER",
      warning: "Supplier type was empty and will be imported as OTHER.",
    };
  }

  const normalized = value.toUpperCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, SupplierType> = {
    DIST: "DISTRIBUTOR",
    DISTRIBUTOR: "DISTRIBUTOR",
    DISTRIBUSI: "DISTRIBUTOR",
    GROSIR: "DISTRIBUTOR",
    MARKETPLACE: "MARKETPLACE",
    ONLINE: "MARKETPLACE",
    TOKOPEDIA: "MARKETPLACE",
    SHOPEE: "MARKETPLACE",
    INDIVIDU: "INDIVIDUAL",
    INDIVIDUAL: "INDIVIDUAL",
    PERORANGAN: "INDIVIDUAL",
    PRIBADI: "INDIVIDUAL",
    MANUFACTURER: "MANUFACTURER",
    MANUFAKTUR: "MANUFACTURER",
    PABRIK: "MANUFACTURER",
    PRODUSEN: "MANUFACTURER",
    OTHER: "OTHER",
    LAINNYA: "OTHER",
    LAIN_LAIN: "OTHER",
  };

  const type = aliases[normalized];
  if (type) return { type, warning: null };

  return {
    type: "OTHER",
    warning: `Unknown supplier type "${value}" was replaced with OTHER.`,
  };
}

function normalizeHeader(value: unknown): string {
  const raw = String(value ?? "").trim();
  const compact = raw.replace(/[\s-]+/g, "_");
  const key = compact.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return HEADER_ALIASES[key] ?? key;
}

function normalizeValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeOptional(value: unknown): string | null {
  const normalized = normalizeValue(value);
  return normalized ? normalized : null;
}
