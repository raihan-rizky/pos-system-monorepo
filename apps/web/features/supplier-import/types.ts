import type { SupplierType } from "@/features/suppliers/types/supplier";

export const REQUIRED_IMPORT_COLUMNS = ["name"] as const;

export const OPTIONAL_IMPORT_COLUMNS = [
  "supplierCode",
  "type",
  "phone",
  "contactPerson",
  "address",
  "notes",
] as const;

export const IMPORT_COLUMNS = [
  ...REQUIRED_IMPORT_COLUMNS,
  ...OPTIONAL_IMPORT_COLUMNS,
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export type ImportRowDecision = "create" | "update" | "skip";
export type PreviewFilter =
  | "all"
  | "ready"
  | "errors"
  | "warnings"
  | "duplicate";

export interface ColumnMapping {
  [rawHeader: string]: ImportColumn | "";
}

export interface ExistingSupplierMatch {
  supplierId: string;
  name: string;
  code?: string | null;
  type: SupplierType;
  phone: string | null;
  isActive: boolean;
}

export interface NormalizedSupplierImportRow {
  rowNumber: number;
  supplierCode: string | null;
  name: string;
  normalizedName: string;
  type: SupplierType;
  phone: string | null;
  contactPerson: string | null;
  address: string | null;
  notes: string | null;
  duplicateInFile: boolean;
  existingMatches: ExistingSupplierMatch[];
  warnings: string[];
  errors: string[];
}

export interface SupplierImportPreviewResponse {
  rows: NormalizedSupplierImportRow[];
  missingColumns: string[];
  unknownColumns: string[];
  warnings: string[];
  errors: string[];
  existingNameMatches: Array<{
    normalizedName: string;
    supplierId: string;
    name: string;
  }>;
  removedEmptyRowCount: number;
  requiredColumns: readonly string[];
  suggestions: Record<string, string>;
}
