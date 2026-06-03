"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getLogger } from "@/lib/logger";
import type {
  ColumnMapping,
  ImportPreviewResponse,
  ImportRowDecision,
  NormalizedImportRow,
} from "../types";

export interface ImportPreviewInput {
  file: File;
  columnMapping?: ColumnMapping;
}

export interface ImportCommitInput {
  rows: NormalizedImportRow[];
  decisions: Record<string, ImportRowDecision>;
}

export interface ImportCommitResult {
  createdCustomerCount: number;
  updatedCustomerCount: number;
  skippedRowCount: number;
  failedRowCount: number;
}

const log = getLogger("feature:customer-import:hooks");

async function previewCustomerImport(
  input: ImportPreviewInput,
): Promise<ImportPreviewResponse> {
  const startedAt = performance.now();
  const formData = new FormData();
  formData.set("file", input.file);
  if (input.columnMapping) {
    formData.set("columnMapping", JSON.stringify(input.columnMapping));
  }

  log.info("customer.import.preview.requested", {
    fileName: input.file.name,
    fileSizeBytes: input.file.size,
    hasColumnMapping: Boolean(input.columnMapping),
    mappedColumnCount: input.columnMapping
      ? Object.values(input.columnMapping).filter(Boolean).length
      : 0,
  });

  const res = await fetch("/api/customers/import/preview", {
    method: "POST",
    body: formData,
  });
  const payload = await res.json();
  if (!res.ok) {
    log.warn("customer.import.preview.request_failed", {
      status: res.status,
      message: payload.message,
      code: payload.code,
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw Object.assign(
      new Error(payload.message || "Failed to preview import"),
      payload,
    );
  }
  log.info("customer.import.preview.request_succeeded", {
    status: res.status,
    rowCount: payload.rows?.length ?? 0,
    warningCount: payload.warnings?.length ?? 0,
    errorCount: payload.errors?.length ?? 0,
    durationMs: Math.round(performance.now() - startedAt),
  });
  return payload;
}

async function commitCustomerImport(
  input: ImportCommitInput,
): Promise<ImportCommitResult> {
  const startedAt = performance.now();
  log.info("customer.import.commit.requested", {
    rowCount: input.rows.length,
    decisionCount: Object.keys(input.decisions).length,
    requestedCreateCount: Object.values(input.decisions).filter((value) => value === "create").length,
    requestedUpdateCount: Object.values(input.decisions).filter((value) => value === "update").length,
    requestedSkipCount: Object.values(input.decisions).filter((value) => value === "skip").length,
  });

  const res = await fetch("/api/customers/import/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await res.json();
  if (!res.ok) {
    log.warn("customer.import.commit.request_failed", {
      status: res.status,
      message: payload.message,
      rowNumber: payload.rowNumber,
      duplicatePhoneCount: payload.duplicatePhones?.length ?? 0,
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw Object.assign(
      new Error(payload.message || "Failed to commit import"),
      payload,
    );
  }
  log.info("customer.import.commit.request_succeeded", {
    status: res.status,
    ...payload,
    durationMs: Math.round(performance.now() - startedAt),
  });
  return payload;
}

export function useCustomerImportPreview() {
  return useMutation({ mutationFn: previewCustomerImport });
}

export function useCustomerImportCommit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commitCustomerImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
