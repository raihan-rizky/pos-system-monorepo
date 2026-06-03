"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type InventoryLogStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface InventoryLog {
  id: string;
  productId: string;
  type: "IN" | "OUT" | "ADJUSTMENT";
  reason: string | null;
  quantity: number;
  note: string | null;
  createdBy: string | null;
  person: string | null;
  createdAt: string;
  status: InventoryLogStatus;
  approvedBy: string | null;
  approverName: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    stock: number;
    imageUrl: string | null;
    category: { name: string; icon: string | null };
  };
  batchItem?: {
    id: string;
    batchOperationId: string;
    action: string;
    beforeSnapshot: unknown;
    afterSnapshot: unknown;
    batchOperation: {
      id: string;
      status: "PENDING" | "COMMITTED" | "UNDONE" | "UNDO_BLOCKED";
      type: string;
      createdBy: string;
      createdAt: string;
      summary: Record<string, unknown>;
    };
  } | null;
}

export interface InventoryLogsResponse {
  data: InventoryLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    pendingTotal?: number;
  };
}

export type InventoryLogsParams = {
  productId?: string;
  type?: string;
  status?: string; // comma-separated PENDING/APPROVED/REJECTED
  page?: number;
  limit?: number;
  days?: number;
};

async function fetchInventoryLogs(
  params: InventoryLogsParams,
): Promise<InventoryLogsResponse> {
  const searchParams = new URLSearchParams();
  if (params.productId) searchParams.set("productId", params.productId);
  if (params.type) searchParams.set("type", params.type);
  if (params.status) searchParams.set("status", params.status);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.days) searchParams.set("days", String(params.days));

  const res = await fetch(`/api/inventory/logs?${searchParams.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch inventory logs");
  return res.json();
}

export function useInventoryLogs(params: InventoryLogsParams = {}) {
  return useQuery({
    queryKey: ["inventory-logs", params],
    queryFn: () => fetchInventoryLogs(params),
  });
}

// Lightweight, dedicated badge query — separate cache key so changing the
// main filter doesn't refetch the badge.
export function usePendingInventoryLogCount() {
  return useQuery({
    queryKey: ["inventory-logs", "pending-count"],
    queryFn: async () => {
      const res = await fetch(
        `/api/inventory/logs?status=PENDING&limit=1&page=1`,
      );
      if (!res.ok) return 0;
      const json = (await res.json()) as InventoryLogsResponse;
      return json.pagination.pendingTotal ?? json.pagination.total ?? 0;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      code?: string;
    };
    const error = new Error(data.message || `Request failed (${res.status})`);
    (error as Error & { status?: number; code?: string }).status = res.status;
    (error as Error & { status?: number; code?: string }).code = data.code;
    throw error;
  }
  return res.json();
}

function invalidateInventoryQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["inventory-logs"] });
  qc.invalidateQueries({ queryKey: ["products"] });
}

export function useApproveInventoryLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postJson(`/api/inventory/${id}/approve`),
    onSuccess: () => invalidateInventoryQueries(qc),
  });
}

export function useRejectInventoryLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      postJson(`/api/inventory/${id}/reject`, { reason }),
    onSuccess: () => invalidateInventoryQueries(qc),
  });
}

export function useCancelInventoryLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postJson(`/api/inventory/${id}/cancel`),
    onSuccess: () => invalidateInventoryQueries(qc),
  });
}

export interface BulkBatchDetail {
  id: string;
  status: "PENDING" | "COMMITTED" | "UNDONE" | "UNDO_BLOCKED";
  type: string;
  createdBy: string;
  createdAt: string;
  summary: Record<string, unknown>;
  creator?: { id: string; name: string | null; role: string } | null;
  items: Array<{
    id: string;
    inventoryLogId: string | null;
    sku: string;
    beforeSnapshot: unknown;
    afterSnapshot: unknown;
    product: { id: string; name: string; sku: string; stock: number } | null;
    inventoryLog: InventoryLog | null;
  }>;
}

export function useBulkBatchDetail(batchId: string | null) {
  return useQuery({
    queryKey: ["inventory-bulk", batchId],
    enabled: Boolean(batchId),
    queryFn: async () => {
      const res = await fetch(`/api/inventory/bulk/${batchId}`);
      if (!res.ok) throw new Error("Failed to load bulk inventory request");
      return res.json() as Promise<BulkBatchDetail>;
    },
  });
}
