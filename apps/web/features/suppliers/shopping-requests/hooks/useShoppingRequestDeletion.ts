"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteShoppingRequest, getShoppingRequestDeletionPreview } from "../api/shopping-request-deletion-api";

export function useShoppingRequestDeletionPreview(id: string | null) {
  return useQuery({
    queryKey: ["shopping-requests", "deletion-preview", id],
    queryFn: () => getShoppingRequestDeletionPreview(id!),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useDeleteShoppingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => deleteShoppingRequest(id, reason),
    onSuccess: () => {
      for (const key of ["shopping-requests", "goods-purchases", "inventory-management", "inventory-logs", "inventory-bulk", "products", "product-stats", "stock-group", "dashboard", "financial-report"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
