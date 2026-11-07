"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCorrectionEditor, getCorrectionHistory, previewCorrection, saveCorrection } from "../api/shopping-request-correction-api";
import type { ShoppingRequestCorrectionInput } from "../types/shopping-request-correction";

export function useCorrectionEditor(id: string | null) {
  return useQuery({ queryKey: ["shopping-requests", "correction", id], queryFn: () => getCorrectionEditor(id!), enabled: Boolean(id), retry: false, refetchOnWindowFocus: false });
}
export function useCorrectionHistory(id: string | null) {
  return useQuery({ queryKey: ["shopping-requests", "correction-history", id], queryFn: () => getCorrectionHistory(id!), enabled: Boolean(id), retry: false });
}
export function usePreviewCorrection(id: string) {
  return useMutation({ mutationFn: (input: ShoppingRequestCorrectionInput) => previewCorrection(id, input) });
}
export function useSaveCorrection(id: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: ShoppingRequestCorrectionInput) => saveCorrection(id, input), onSuccess: async () => {
    await Promise.all(["shopping-requests", "goods-purchases", "inventory-management", "inventory-logs", "inventory-bulk", "products", "product-stats", "stock-group", "dashboard", "financial-report", "expenses", "supplier-payables", "suppliers", "product-price-logs"].map(key => client.invalidateQueries({ queryKey: [key] })));
  } });
}
