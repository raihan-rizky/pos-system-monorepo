import type {
  ColumnMapping,
  ImportRowDecision,
  NormalizedSupplierImportRow,
  SupplierImportPreviewResponse,
} from "../types";

export interface SupplierImportPreviewInput {
  file: File;
  columnMapping?: ColumnMapping;
}

export interface SupplierImportCommitInput {
  rows: NormalizedSupplierImportRow[];
  decisions: Record<string, ImportRowDecision>;
  selectedExistingSupplierIds: Record<string, string>;
}

export interface SupplierImportCommitResult {
  createdSupplierCount: number;
  updatedSupplierCount: number;
  skippedRowCount: number;
  failedRowCount: number;
}

export interface SupplierImportApiErrorPayload {
  message?: string;
  code?: string;
  errors?: Record<string, string[]>;
  missingColumns?: string[];
  unknownColumns?: string[];
  requiredColumns?: string[];
  suggestions?: Record<string, string>;
  removedEmptyRowCount?: number;
  rowNumber?: number;
  duplicateNames?: string[];
}

export class SupplierImportApiError extends Error {
  readonly status: number;
  readonly payload: SupplierImportApiErrorPayload | null;

  constructor(
    message: string,
    status: number,
    payload: SupplierImportApiErrorPayload | null,
  ) {
    super(message);
    this.name = "SupplierImportApiError";
    this.status = status;
    this.payload = payload;
    Object.assign(this, payload);
  }
}

export async function previewSupplierImport(
  input: SupplierImportPreviewInput,
): Promise<SupplierImportPreviewResponse> {
  const form = new FormData();
  form.set("file", input.file);
  if (input.columnMapping) {
    form.set("columnMapping", JSON.stringify(input.columnMapping));
  }

  return supplierImportRequest<SupplierImportPreviewResponse>(
    "/api/suppliers/import/preview",
    {
      method: "POST",
      body: form,
    },
  );
}

export async function commitSupplierImport(
  input: SupplierImportCommitInput,
): Promise<SupplierImportCommitResult> {
  return supplierImportRequest<SupplierImportCommitResult>(
    "/api/suppliers/import/commit",
    {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
    },
  );
}

async function supplierImportRequest<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const errorPayload = payload as SupplierImportApiErrorPayload | null;
    throw new SupplierImportApiError(
      errorPayload?.message || `Request failed (${response.status})`,
      response.status,
      errorPayload,
    );
  }

  return payload as T;
}
