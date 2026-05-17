"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnMapping, ImportPreviewResponse, NormalizedImportRow } from "../types";

export interface ImportPreviewInput {
  file: File;
  columnMapping?: ColumnMapping;
}

export interface ImportCommitInput {
  rows: NormalizedImportRow[];
  decisions: Record<string, "create" | "update" | "skip">;
  createMissingCategories: boolean;
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
  const res = await fetch("/api/products/import/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.message || "Failed to commit import");
  return payload as {
    createdProductCount: number;
    updatedProductCount: number;
    skippedRowCount: number;
    createdCategoryCount: number;
    inventoryLogCount: number;
    batchOperationId: string;
    undoAvailable: boolean;
  };
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
