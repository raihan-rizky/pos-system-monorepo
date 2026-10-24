"use client";

import { invalidatePricingQueries } from "@/features/product-stock-groups/invalidate-pricing-queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

async function undoBatchOperation(batchOperationId: string) {
  const res = await fetch(`/api/batch-operations/${batchOperationId}/undo`, { method: "POST" });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.message || "Failed to undo batch operation");
  return payload as {
    success: boolean;
    reversalInventoryLogCount: number;
    blockedProducts: string[];
    undoBatchOperationId?: string;
  };
}

export function useUndoBatchOperation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: undoBatchOperation,
    onSuccess: () => {
      void invalidatePricingQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["inventory-logs"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
