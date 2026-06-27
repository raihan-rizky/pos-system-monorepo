"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchInventorySummary } from "../api/inventory-management-api";

export function useInventorySummary(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["inventory-management", "summary"],
    queryFn: fetchInventorySummary,
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  });
}
