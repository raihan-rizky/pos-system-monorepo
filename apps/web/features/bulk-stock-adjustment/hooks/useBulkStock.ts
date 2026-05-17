"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface BulkStockInput {
  productIds: string[];
  type: "IN" | "OUT" | "ADJUSTMENT";
  quantities: Record<string, number>;
  note: string;
}

async function previewBulkStock(input: BulkStockInput) {
  const res = await fetch("/api/inventory/bulk/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.message || "Failed to preview stock update");
  return payload as {
    rows: Array<{
      productId: string;
      name: string;
      sku: string;
      unit: string;
      beforeStock: number;
      quantity: number;
      afterStock: number;
      errors: string[];
      warnings: string[];
    }>;
    errors: string[];
    warnings: string[];
  };
}

async function commitBulkStock(input: BulkStockInput) {
  const res = await fetch("/api/inventory/bulk/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.message || "Failed to commit stock update");
  return payload as {
    updatedProductCount: number;
    inventoryLogCount: number;
    batchOperationId: string;
    undoAvailable: boolean;
  };
}

export function useBulkStockPreview() {
  return useMutation({ mutationFn: previewBulkStock });
}

export function useBulkStockCommit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commitBulkStock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-logs"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
