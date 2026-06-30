import { z } from "zod";
import { parseSpreadsheetMatrix } from "@/lib/server/spreadsheet-parser";
import {
  CUSTOMER_TYPES,
  type CustomerType,
} from "@/lib/customers";
import {
  IMPORT_COLUMNS,
  REQUIRED_IMPORT_COLUMNS,
  type ColumnMapping,
  type ImportPreviewResponse,
  type NormalizedImportRow,
} from "../types";

export const MAX_CUSTOMER_IMPORT_ROWS = 500;

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

export const importRowCommitSchema = z.object({
  rowNumber: z.number().int().min(1),
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1).nullable().optional(),
  email: z.string().email().nullable().optional(),
  company: z.string().trim().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  type: z.enum(CUSTOMER_TYPES),
  notes: z.string().trim().nullable().optional(),
  duplicateInFile: z.boolean(),
  existingCustomerId: z.string().optional(),
  existingCustomerName: z.string().optional(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});

export type ImportCommitRow = z.infer<typeof importRowCommitSchema>;

function normalizeHeader(value: unknown) {
  const raw = String(value ?? "").trim();
  const compact = raw.replace(/[\s-]+/g, "_");
  const key = compact.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return HEADER_ALIASES[key] ?? key;
}

function normalizeValue(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeOptional(value: unknown) {
  const normalized = normalizeValue(value);
  return normalized ? normalized : null;
}

async function parseWorkbookRows(buffer: ArrayBuffer, columnMapping?: ColumnMapping) {
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

  return {
    headers: normalizedHeaders.filter(Boolean),
    records,
  };
}

export function parseImportFile(buffer: ArrayBuffer, columnMapping?: ColumnMapping) {
  return parseWorkbookRows(buffer, columnMapping);
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

function normalizeCustomerType(rawType: unknown) {
  const value = normalizeValue(rawType).toUpperCase();
  if (!value) return { type: "UMUM" as CustomerType, warning: null };
  if (CUSTOMER_TYPES.includes(value as CustomerType)) {
    return { type: value as CustomerType, warning: null };
  }
  return {
    type: "UMUM" as CustomerType,
    warning: `Unknown customer type "${value}" was replaced with UMUM.`,
  };
}

function normalizeEmail(rawEmail: unknown) {
  const value = normalizeOptional(rawEmail);
  if (!value) return { email: null, warning: null };

  const parsed = z.string().email().safeParse(value);
  if (parsed.success) return { email: value, warning: null };

  return {
    email: null,
    warning: "Email was not valid and will be imported as empty.",
  };
}

export function normalizeImportRows(
  records: Record<string, unknown>[],
  existingPhoneMap: Map<string, { id: string; name: string }>,
): Pick<
  ImportPreviewResponse,
  "rows" | "warnings" | "errors" | "existingPhoneMatches"
> {
  const phoneCounts = new Map<string, number>();

  records.forEach((record) => {
    const phone = normalizeOptional(record.phone);
    if (phone) {
      phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
    }
  });

  const existingPhoneMatches = new Map<
    string,
    { phone: string; customerId: string; name: string }
  >();
  const warnings: string[] = [];
  const errors: string[] = [];

  const rows: NormalizedImportRow[] = records
    .slice(0, MAX_CUSTOMER_IMPORT_ROWS)
    .map((record, index) => {
      const rowNumber = index + 2;
      const rowWarnings: string[] = [];
      const rowErrors: string[] = [];
      const phone = normalizeOptional(record.phone);
      const { email, warning: emailWarning } = normalizeEmail(record.email);
      const { type, warning: typeWarning } = normalizeCustomerType(record.type);

      if (!normalizeValue(record.name)) {
        rowErrors.push("Name is required.");
      }

      if (emailWarning) rowWarnings.push(emailWarning);
      if (typeWarning) rowWarnings.push(typeWarning);

      const duplicateInFile = phone ? (phoneCounts.get(phone) ?? 0) > 1 : false;
      if (duplicateInFile) {
        rowWarnings.push(
          "Duplicate phone number in file. Choose one active row and skip the rest.",
        );
      }

      const existingCustomer = phone ? existingPhoneMap.get(phone) : undefined;
      if (phone && existingCustomer) {
        rowWarnings.push(
          "Phone already exists. Choose update or skip before commit.",
        );
        existingPhoneMatches.set(phone, {
          phone,
          customerId: existingCustomer.id,
          name: existingCustomer.name,
        });
      }

      rowWarnings.forEach((warning) =>
        warnings.push(`Row ${rowNumber}: ${warning}`),
      );
      rowErrors.forEach((error) => errors.push(`Row ${rowNumber}: ${error}`));

      return {
        rowNumber,
        name: normalizeValue(record.name),
        phone,
        email,
        company: normalizeOptional(record.company),
        address: normalizeOptional(record.address),
        type,
        notes: normalizeOptional(record.notes),
        duplicateInFile,
        existingCustomerId: existingCustomer?.id,
        existingCustomerName: existingCustomer?.name,
        warnings: rowWarnings,
        errors: rowErrors,
      };
    });

  if (records.length > MAX_CUSTOMER_IMPORT_ROWS) {
    errors.push(
      `Import files are limited to ${MAX_CUSTOMER_IMPORT_ROWS} rows.`,
    );
  }

  return {
    rows,
    warnings,
    errors,
    existingPhoneMatches: Array.from(existingPhoneMatches.values()),
  };
}
