"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

async function requestJson(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return res.json();
}

function invalidate(qc: ReturnType<typeof useQueryClient>, batchId?: string) {
  qc.invalidateQueries({ queryKey: ["inventory-logs"] });
  qc.invalidateQueries({ queryKey: ["products"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  if (batchId) qc.invalidateQueries({ queryKey: ["inventory-bulk", batchId] });
}

export function useApproveBulkItem(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inventoryLogId: string) =>
      requestJson(`/api/inventory/bulk/${batchId}/approve-item`, {
        method: "POST",
        body: JSON.stringify({ inventoryLogId }),
      }),
    onSuccess: () => invalidate(qc, batchId),
  });
}

export function useRejectBulkItem(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      inventoryLogId,
      reason,
    }: {
      inventoryLogId: string;
      reason: string;
    }) =>
      requestJson(`/api/inventory/bulk/${batchId}/reject-item`, {
        method: "POST",
        body: JSON.stringify({ inventoryLogId, reason }),
      }),
    onSuccess: () => invalidate(qc, batchId),
  });
}

export function useEditBulkItem(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      inventoryLogId,
      quantity,
    }: {
      inventoryLogId: string;
      quantity: number;
    }) =>
      requestJson(`/api/inventory/bulk/${batchId}/edit-item`, {
        method: "PATCH",
        body: JSON.stringify({ inventoryLogId, quantity }),
      }),
    onSuccess: () => invalidate(qc, batchId),
  });
}

export function useApproveBulkAll(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      requestJson(`/api/inventory/bulk/${batchId}/approve-all`, {
        method: "POST",
      }),
    onSuccess: () => invalidate(qc, batchId),
  });
}

export function useRejectBulkAll(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      requestJson(`/api/inventory/bulk/${batchId}/reject-all`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => invalidate(qc, batchId),
  });
}

export function useCancelBulkBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) =>
      requestJson(`/api/inventory/bulk/${batchId}/cancel`, {
        method: "POST",
      }),
    onSuccess: (_data, batchId) => invalidate(qc, batchId),
  });
}
