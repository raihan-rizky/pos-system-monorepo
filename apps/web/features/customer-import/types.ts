import type { CustomerType } from "@/lib/customers";

export const REQUIRED_IMPORT_COLUMNS = ["name"] as const;

export const OPTIONAL_IMPORT_COLUMNS = [
  "phone",
  "email",
  "company",
  "address",
  "type",
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

export interface NormalizedImportRow {
  rowNumber: number;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  address: string | null;
  type: CustomerType;
  notes: string | null;
  duplicateInFile: boolean;
  existingCustomerId?: string;
  existingCustomerName?: string;
  warnings: string[];
  errors: string[];
}

export interface ImportPreviewResponse {
  rows: NormalizedImportRow[];
  missingColumns: string[];
  unknownColumns: string[];
  warnings: string[];
  errors: string[];
  existingPhoneMatches: Array<{
    phone: string;
    customerId: string;
    name: string;
  }>;
  requiredColumns: readonly string[];
  suggestions: Record<string, string>;
}

