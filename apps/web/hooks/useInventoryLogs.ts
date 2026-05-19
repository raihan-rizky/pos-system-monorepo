"use client";

import { useQuery } from "@tanstack/react-query";

export interface InventoryLog {
  id: string;
  productId: string;
  type: "IN" | "OUT" | "ADJUSTMENT";
  quantity: number;
  note: string | null;
  createdBy: string | null;
  person: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    stock: number;
    imageUrl: string | null;
    category: { icon: string | null };
  };
}

export interface InventoryLogsResponse {
  logs: InventoryLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

async function fetchInventoryLogs(params: {
  productId?: string;
  type?: string;
  page?: number;
  limit?: number;
  days?: number;
}): Promise<InventoryLogsResponse> {
  const searchParams = new URLSearchParams();
  if (params.productId) searchParams.set("productId", params.productId);
  if (params.type) searchParams.set("type", params.type);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.days) searchParams.set("days", String(params.days));

  const res = await fetch(`/api/inventory/logs?${searchParams.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch inventory logs");
  return res.json();
}

export function useInventoryLogs(params: {
  productId?: string;
  type?: string;
  page?: number;
  limit?: number;
  days?: number;
} = {}) {
  return useQuery({
    queryKey: ["inventory-logs", params],
    queryFn: () => fetchInventoryLogs(params),
  });
}

