"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ─── Types ──────────────────────────────────────────────────────────────────────

export type ProductionStatus =
  | "PRINTING"
  | "READY_PICKUP"
  | "DELIVERED";

export interface JobOrderItem {
  id: string;
  productName: string;
  size: string | null;
  material: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  product: {
    id: string;
    name: string;
    imageUrl: string | null;
  };
}

export interface JobOrder {
  id: string;
  invoiceNumber: string;
  customerName: string | null;
  salesName: string | null;
  status: string; // TransactionStatus: COMPLETED | DP | VOIDED | REFUNDED
  productionStatus: ProductionStatus;
  total: number;
  amountPaid: number;
  note: string | null;
  estimatedDoneAt: string | null;
  createdAt: string;
  items: JobOrderItem[];
  salesperson: { id: string; name: string } | null;
}

export interface ProductionActivityLog {
  id: string;
  transactionId: string;
  storeId: string;
  invoiceNumber: string | null;
  customerName: string | null;
  fromStatus: ProductionStatus | null;
  toStatus: ProductionStatus;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  createdAt: string;
}

// ─── Fetch ──────────────────────────────────────────────────────────────────────

async function fetchJobOrders(): Promise<JobOrder[]> {
  const res = await fetch("/api/job-orders");
  if (!res.ok) throw new Error("Failed to fetch job orders");
  const json = (await res.json()) as { data: JobOrder[] };
  return json.data;
}

async function fetchProductionActivity(limit = 20): Promise<ProductionActivityLog[]> {
  const res = await fetch(`/api/job-orders/activity?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch production activity");
  const json = (await res.json()) as { data: ProductionActivityLog[] };
  return json.data;
}

async function fetchJobOrderActivity(
  id: string,
): Promise<ProductionActivityLog[]> {
  const res = await fetch(`/api/job-orders/${id}/activity`);
  if (!res.ok) throw new Error("Failed to fetch job order activity");
  const json = (await res.json()) as { data: ProductionActivityLog[] };
  return json.data;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────────

export function useJobOrders() {
  return useQuery({
    queryKey: ["job-orders"],
    queryFn: fetchJobOrders,
    refetchInterval: 30_000, // Poll every 30s for real-time feel
  });
}

export function useProductionActivity(limit = 20) {
  return useQuery({
    queryKey: ["production-activity", limit],
    queryFn: () => fetchProductionActivity(limit),
    refetchInterval: 30_000,
  });
}

export function useJobOrderActivity(id: string, enabled = true) {
  return useQuery({
    queryKey: ["job-order-activity", id],
    queryFn: () => fetchJobOrderActivity(id),
    enabled,
  });
}

export function useMoveJobOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      productionStatus,
    }: {
      id: string;
      productionStatus: ProductionStatus;
    }) => {
      const res = await fetch(`/api/job-orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productionStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    // Optimistic update: immediately move card to new column
    onMutate: async ({ id, productionStatus }) => {
      await queryClient.cancelQueries({ queryKey: ["job-orders"] });
      const previous = queryClient.getQueryData<JobOrder[]>(["job-orders"]);

      queryClient.setQueryData<JobOrder[]>(["job-orders"], (old = []) =>
        old.map((order) =>
          order.id === id ? { ...order, productionStatus } : order
        )
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["job-orders"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["job-orders"] });
      queryClient.invalidateQueries({ queryKey: ["production-activity"] });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["job-order-activity", variables.id],
      });
    },
  });
}
