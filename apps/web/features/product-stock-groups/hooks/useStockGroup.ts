import { useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchStockGroupDetail,
  updateSharedStock,
  updateConversionRate,
  updateVariantPrice,
  addVariant,
  type UpdateSharedStockPayload,
  type UpdateConversionRatePayload,
  type UpdateVariantPricePayload,
  type AddVariantPayload,
} from "../api/stock-group-api";

export function stockGroupDetailKey(groupId: string) {
  return ["stock-group", "detail", groupId] as const;
}

export function useSuspenseStockGroupDetail(groupId: string) {
  return useSuspenseQuery({
    queryKey: stockGroupDetailKey(groupId),
    queryFn: () => fetchStockGroupDetail(groupId),
  });
}

export function useUpdateSharedStock(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateSharedStockPayload) => updateSharedStock(groupId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockGroupDetailKey(groupId) });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-stats"] });
    },
  });
}

export function useUpdateConversionRate(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateConversionRatePayload) => updateConversionRate(groupId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockGroupDetailKey(groupId) });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-stats"] });
    },
  });
}

export function useUpdateVariantPrice(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, payload }: { productId: string; payload: UpdateVariantPricePayload }) =>
      updateVariantPrice(groupId, productId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockGroupDetailKey(groupId) });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-stats"] });
    },
  });
}

export function useAddVariant(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddVariantPayload) => addVariant(groupId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockGroupDetailKey(groupId) });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-stats"] });
    },
  });
}
