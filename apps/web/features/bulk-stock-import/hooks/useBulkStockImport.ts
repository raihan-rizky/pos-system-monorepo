"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

import type {
  BulkStockImportMode,
  BulkStockImportRow,
} from "../helpers/import-core";

export interface BulkStockImportPreviewResponse {
  rows: BulkStockImportRow[];
  summary: {
    validRows: number;
    skippedRows: number;
    errorRows: number;
    warningRows: number;
  };
  missingColumns: string[];
  requiredColumns: readonly string[];
}

export interface BulkStockImportCommitInput {
  mode: BulkStockImportMode;
  rows: Array<{
    rowNumber: number;
    name: string;
    category: string;
    unit: string;
    stock: number;
    selectedProductId?: string;
  }>;
  supplierId?: string;
  note?: string;
  allowNegativeStock?: boolean;
}

export type BulkStockImportJobStatus =
  | "PENDING"
  | "RUNNING"
  | "COMMITTED"
  | "PENDING_APPROVAL"
  | "FAILED";

export interface BulkStockImportJobResponse {
  id: string;
  status: BulkStockImportJobStatus;
  phase: string;
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  result: {
    updatedProductCount: number;
    inventoryLogCount: number;
    batchOperationId: string;
    status: "PENDING" | "COMMITTED";
    pendingApproval: boolean;
    undoAvailable: boolean;
  } | null;
  errorMessage: string | null;
}

type ApiErrorPayload = {
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

export function formatBulkStockImportApiErrorMessage(
  payload: ApiErrorPayload | null | undefined,
  fallback: string,
) {
  if (payload?.message && payload.message !== "Validation error") {
    return payload.message;
  }

  const fieldError = payload?.errors
    ? Object.values(payload.errors)
        .flatMap((messages) => messages ?? [])
        .find(Boolean)
    : null;

  return fieldError || payload?.message || fallback;
}

async function previewBulkStockImport(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  const res = await fetch("/api/inventory/bulk/import/preview", {
    method: "POST",
    body: formData,
  });
  const payload = await res.json();
  if (!res.ok) {
    throw Object.assign(
      new Error(
        formatBulkStockImportApiErrorMessage(
          payload,
          "Failed to preview bulk stock import",
        ),
      ),
      payload,
    );
  }
  return payload as BulkStockImportPreviewResponse;
}

async function commitBulkStockImport(input: BulkStockImportCommitInput) {
  const res = await fetch("/api/inventory/bulk/import/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await res.json();
  if (!res.ok) {
    throw Object.assign(
      new Error(
        formatBulkStockImportApiErrorMessage(
          payload,
          "Failed to commit bulk stock import",
        ),
      ),
      payload,
    );
  }
  return payload as {
    updatedProductCount: number;
    inventoryLogCount: number;
    batchOperationId: string;
    status: "PENDING" | "COMMITTED";
    pendingApproval: boolean;
    undoAvailable: boolean;
  };
}

export async function startBulkStockImportCommitJob(
  input: BulkStockImportCommitInput,
) {
  const res = await fetch("/api/inventory/bulk/import/commit/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await res.json();
  if (!res.ok) {
    throw Object.assign(
      new Error(
        formatBulkStockImportApiErrorMessage(
          payload,
          "Failed to start bulk stock import",
        ),
      ),
      payload,
    );
  }
  return payload as BulkStockImportJobResponse;
}

export async function getBulkStockImportCommitJob(jobId: string) {
  const res = await fetch(`/api/inventory/bulk/import/commit/jobs/${jobId}`);
  const payload = await res.json();
  if (!res.ok) {
    throw Object.assign(
      new Error(
        formatBulkStockImportApiErrorMessage(
          payload,
          "Failed to load bulk stock import progress",
        ),
      ),
      payload,
    );
  }
  return payload as BulkStockImportJobResponse;
}

export function useBulkStockImportPreview() {
  return useMutation({ mutationFn: previewBulkStockImport });
}

export function useBulkStockImportCommit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commitBulkStockImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-logs"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useBulkStockImportCommitJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startBulkStockImportCommitJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bulk-stock-import-job"] });
    },
  });
}

export function useBulkStockImportCommitJobStatus(jobId: string | null) {
  return useQuery<BulkStockImportJobResponse>({
    queryKey: ["bulk-stock-import-job", jobId],
    queryFn: () => getBulkStockImportCommitJob(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "PENDING" || status === "RUNNING" ? 1500 : false;
    },
  });
}
