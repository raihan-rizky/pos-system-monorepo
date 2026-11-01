"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  BulkStockImportMode,
  BulkStockImportRow,
} from "../helpers/import-core";

export const BULK_STOCK_IMPORT_ACTIVE_JOB_QUERY_KEY = ["bulk-stock-import-active-job"] as const;

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
    category?: string;
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
    batchOperationId: string | null;
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
          "Gagal membuat pratinjau impor stok massal",
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
          "Gagal menerapkan impor stok massal",
        ),
      ),
      payload,
    );
  }
  return payload as {
    updatedProductCount: number;
    inventoryLogCount: number;
    batchOperationId: string | null;
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
          "Gagal memulai impor stok massal",
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
          "Gagal memuat progres impor stok massal",
        ),
      ),
      payload,
    );
  }
  return payload as BulkStockImportJobResponse;
}

export async function getActiveBulkStockImportJob(): Promise<BulkStockImportJobResponse | null> {
  const res = await fetch("/api/inventory/bulk/import/commit/jobs/active");
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(formatBulkStockImportApiErrorMessage(payload, "Gagal memuat impor stok yang berjalan"));
  }
  return payload.job;
}

export function useActiveBulkStockImportJob(enabled = true) {
  return useQuery({
    queryKey: BULK_STOCK_IMPORT_ACTIVE_JOB_QUERY_KEY,
    queryFn: getActiveBulkStockImportJob,
    enabled,
    refetchInterval: 5_000,
  });
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
    onSuccess: (job) => {
      queryClient.setQueryData(BULK_STOCK_IMPORT_ACTIVE_JOB_QUERY_KEY, job);
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
      return !status || status === "PENDING" || status === "RUNNING" ? 1500 : false;
    },
  });
}

export function useBulkStockImportJobTracking(enabled = true) {
  const queryClient = useQueryClient();
  const [lastJob, setLastJob] = useState<BulkStockImportJobResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const invalidatedJobId = useRef<string | null>(null);
  const activeQuery = useActiveBulkStockImportJob(enabled);
  const trackedJob = lastJob ?? activeQuery.data ?? null;
  const jobId = enabled ? trackedJob?.id ?? null : null;
  const detailQuery = useBulkStockImportCommitJobStatus(jobId);
  const job = enabled ? detailQuery.data ?? trackedJob : null;

  useEffect(() => {
    if (job) setLastJob(job);
  }, [job]);

  useEffect(() => {
    if (!job || job.status === "PENDING" || job.status === "RUNNING" || invalidatedJobId.current === job.id) return;
    invalidatedJobId.current = job.id;
    void queryClient.invalidateQueries({ queryKey: BULK_STOCK_IMPORT_ACTIVE_JOB_QUERY_KEY });
    if (job.status !== "FAILED") {
      for (const key of ["products", "product-stats", "inventory-logs", "dashboard"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    }
  }, [job, queryClient]);

  const onJobStarted = useCallback((createdJob: BulkStockImportJobResponse) => {
    setLastJob(createdJob);
    queryClient.setQueryData(BULK_STOCK_IMPORT_ACTIVE_JOB_QUERY_KEY, createdJob);
  }, [queryClient]);

  const close = () => {
    setIsOpen(false);
    if (job && job.status !== "PENDING" && job.status !== "RUNNING") {
      setLastJob(null);
      queryClient.setQueryData<BulkStockImportJobResponse | null>(
        BULK_STOCK_IMPORT_ACTIVE_JOB_QUERY_KEY,
        (activeJob) => activeJob?.id === job.id ? null : activeJob,
      );
      void queryClient.invalidateQueries({ queryKey: BULK_STOCK_IMPORT_ACTIVE_JOB_QUERY_KEY });
    }
  };

  return {
    job,
    isOpen,
    open: () => setIsOpen(true),
    close,
    onJobStarted,
    isRefreshing: activeQuery.isFetching || detailQuery.isFetching,
    refreshError: detailQuery.error ?? activeQuery.error,
    refresh: async () => {
      const result = await activeQuery.refetch();
      if (jobId) await detailQuery.refetch();
      return result;
    },
  };
}
