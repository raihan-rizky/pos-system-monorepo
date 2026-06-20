"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnMapping, ImportPreviewResponse, NormalizedImportRow, ImportRowDecision } from "../types";

export const PRODUCT_IMPORT_ACTIVE_JOB_QUERY_KEY = ["product-import", "active-job"] as const;
export const productImportJobQueryKey = (jobId: string) =>
  ["product-import", "job", jobId] as const;

export interface ImportPreviewInput {
  file: File;
  columnMapping?: ColumnMapping;
}

export interface ImportCommitInput {
  rows: NormalizedImportRow[];
  decisions: Record<string, ImportRowDecision>;
  createMissingCategories: boolean;
  onProgress?: (current: number, total: number, job: ProductImportJobResponse) => void;
}

export type ProductImportJobStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "COMPLETED_WITH_ERRORS"
  | "FAILED"
  | "CANCEL_REQUESTED"
  | "CANCELLED";

export interface ProductImportJobResponse {
  id: string;
  batchOperationId: string;
  status: ProductImportJobStatus;
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  skippedRows: number;
  summary?: Record<string, unknown>;
  rows?: Array<{
    rowNumber: number;
    sku: string;
    errorCode?: string | null;
    errorMessage?: string | null;
  }>;
  lastError?: string | null;
}

interface ProductImportCommitResult {
  createdProductCount: number;
  variantProductCount: number;
  updatedProductCount: number;
  skippedRowCount: number;
  conversionReviewCount: number;
  createdCategoryCount: number;
  inventoryLogCount: number;
  batchOperationId: string;
  undoAvailable: boolean;
  jobId: string;
  jobStatus: ProductImportJobStatus;
  failedRowCount: number;
  failedRows?: ProductImportJobResponse["rows"];
}

async function previewProductImport(input: ImportPreviewInput): Promise<ImportPreviewResponse> {
  const formData = new FormData();
  formData.set("file", input.file);
  if (input.columnMapping) {
    formData.set("columnMapping", JSON.stringify(input.columnMapping));
  }
  const res = await fetch("/api/products/import/preview", { method: "POST", body: formData });
  const payload = await res.json();
  if (!res.ok) throw Object.assign(new Error(payload.message || "Failed to preview import"), payload);
  return payload;
}

async function commitProductImport(input: ImportCommitInput) {
  const job = await postProductImportJson<ProductImportJobResponse>(
    "/api/products/import/jobs",
    input,
  );
  const finalJob = await pollProductImportJob(job.id, input.onProgress);
  const summary = finalJob.summary ?? {};

  const result: ProductImportCommitResult = {
    createdProductCount: Number(summary.createdProductCount ?? 0),
    variantProductCount: Number(summary.variantProductCount ?? 0),
    updatedProductCount: Number(summary.updatedProductCount ?? 0),
    skippedRowCount: Number(summary.skippedRowCount ?? finalJob.skippedRows ?? 0),
    conversionReviewCount: Number(summary.conversionReviewCount ?? 0),
    createdCategoryCount: Number(summary.createdCategoryCount ?? 0),
    inventoryLogCount: Number(summary.inventoryLogCount ?? 0),
    batchOperationId: finalJob.batchOperationId,
    undoAvailable: true,
    jobId: finalJob.id,
    jobStatus: finalJob.status,
    failedRowCount: finalJob.failedRows,
    failedRows: finalJob.rows,
  };

  if (finalJob.status === "FAILED" || finalJob.status === "CANCELLED") {
    throw Object.assign(new Error("Product import job did not complete"), result);
  }

  return result;
}

async function pollProductImportJob(
  jobId: string,
  onProgress?: (current: number, total: number, job: ProductImportJobResponse) => void,
): Promise<ProductImportJobResponse> {
  const startedAt = Date.now();
  const timeoutMs = 15 * 60 * 1000;
  const terminalStatuses: ProductImportJobStatus[] = [
    "COMPLETED",
    "COMPLETED_WITH_ERRORS",
    "FAILED",
    "CANCELLED",
  ];

  while (Date.now() - startedAt < timeoutMs) {
    const job = await getProductImportJson<ProductImportJobResponse>(
      `/api/products/import/jobs/${jobId}`,
    );
    onProgress?.(job.processedRows, job.totalRows, job);
    if (terminalStatuses.includes(job.status)) {
      return job;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1_500));
  }

  throw new Error("Timed out waiting for product import job");
}

async function postProductImportJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) throw Object.assign(new Error(payload.message || "Failed to commit import"), payload);
  return payload as T;
}

async function getProductImportJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "GET" });
  const payload = await res.json();
  if (!res.ok) throw Object.assign(new Error(payload.message || "Failed to load import job"), payload);
  return payload as T;
}

async function fetchActiveProductImportJob(): Promise<ProductImportJobResponse | null> {
  const payload = await getProductImportJson<{ job: ProductImportJobResponse | null }>(
    "/api/products/import/jobs/active",
  );
  return payload.job;
}

async function postProductImportJobAction(jobId: string, action: "cancel" | "retry") {
  return postProductImportJson<ProductImportJobResponse>(
    `/api/products/import/jobs/${jobId}/${action}`,
    {},
  );
}

export function useProductImportPreview() {
  return useMutation({ mutationFn: previewProductImport });
}

export function useProductImportCommit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commitProductImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-logs"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useActiveProductImportJob() {
  return useQuery({
    queryKey: PRODUCT_IMPORT_ACTIVE_JOB_QUERY_KEY,
    queryFn: fetchActiveProductImportJob,
    refetchInterval: 5_000,
  });
}

export function useProductImportJobStatus(jobId: string | null, enabled = true) {
  return useQuery({
    queryKey: jobId ? productImportJobQueryKey(jobId) : ["product-import", "job", "none"],
    queryFn: () => getProductImportJson<ProductImportJobResponse>(`/api/products/import/jobs/${jobId}`),
    enabled: Boolean(jobId) && enabled,
    refetchInterval: 5_000,
  });
}

export function useCancelProductImportJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => postProductImportJobAction(jobId, "cancel"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCT_IMPORT_ACTIVE_JOB_QUERY_KEY });
    },
  });
}

export function useRetryProductImportJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => postProductImportJobAction(jobId, "retry"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCT_IMPORT_ACTIVE_JOB_QUERY_KEY });
    },
  });
}

export function useProductImageExtract() {
  return useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((file, i) => formData.append(`image_${i}`, file));
      
      const res = await fetch("/api/products/import/image-extract", {
        method: "POST",
        body: formData,
      });
      
      const payload = await res.json();
      if (!res.ok) throw Object.assign(new Error(payload.error || "Failed to extract images"), payload);
      
      // We return the payload as an ImportPreviewResponse so it fits right into the existing preview UI
      return payload as ImportPreviewResponse;
    }
  });
}
