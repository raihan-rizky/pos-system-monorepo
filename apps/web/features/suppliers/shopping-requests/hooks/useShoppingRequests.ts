"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  listShoppingRequests,
  getShoppingRequestSummary,
  getShoppingRequest,
  createShoppingRequest,
  approveShoppingRequest,
  approveShoppingRequestItem,
  cancelShoppingRequest,
  saveShoppingRequestApprovedQuantities,
  updateShoppingRequest,
  type ShoppingRequestListParams,
} from "../api/shopping-requests-api";
import type {
  CreateShoppingRequestInput,
  ApproveShoppingRequestInput,
  ApproveShoppingRequestIndividualItemInput,
  SaveShoppingRequestApprovedQuantitiesInput,
  UpdateShoppingRequestInput,
} from "../types/shopping-request";

export function useShoppingRequests(params: ShoppingRequestListParams = {}) {
  return useQuery({
    queryKey: ["shopping-requests", params],
    queryFn: () => listShoppingRequests(params),
    select: (res) => ({
      data: res.data,
      pagination: res.pagination,
    }),
    placeholderData: keepPreviousData,
  });
}

export function useShoppingRequestSummary() {
  return useQuery({
    queryKey: ["shopping-requests", "summary"],
    queryFn: getShoppingRequestSummary,
    staleTime: 30_000,
  });
}

export function useShoppingRequest(id: string | null) {
  return useQuery({
    queryKey: ["shopping-requests", id],
    queryFn: () => getShoppingRequest(id!),
    enabled: !!id,
    select: (res) => res.data,
  });
}

export function useCreateShoppingRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateShoppingRequestInput) =>
      createShoppingRequest(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-requests"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers", "summary"] });
    },
  });
}

export function useApproveShoppingRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: ApproveShoppingRequestInput;
    }) => approveShoppingRequest(id, input),
    onSuccess: () => invalidateShoppingRequestStockQueries(queryClient),
  });
}

export function useSaveShoppingRequestApprovedQuantities() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: SaveShoppingRequestApprovedQuantitiesInput;
    }) => saveShoppingRequestApprovedQuantities(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-requests"] });
    },
  });
}

export function useApproveShoppingRequestItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      itemId,
      input,
    }: {
      id: string;
      itemId: string;
      input: ApproveShoppingRequestIndividualItemInput;
    }) => approveShoppingRequestItem(id, itemId, input),
    onSuccess: () => invalidateShoppingRequestStockQueries(queryClient),
  });
}

export function useUpdateShoppingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateShoppingRequestInput }) =>
      updateShoppingRequest(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-requests"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers", "summary"] });
    },
  });
}

function invalidateShoppingRequestStockQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: ["shopping-requests"] });
  queryClient.invalidateQueries({ queryKey: ["products"] });
  queryClient.invalidateQueries({ queryKey: ["inventory-logs"] });
  queryClient.invalidateQueries({ queryKey: ["inventory-management"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["receiving-queue"] });
  queryClient.invalidateQueries({ queryKey: ["finance"] });
  queryClient.invalidateQueries({ queryKey: ["financial-report"] });
}

export function useCancelShoppingRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => cancelShoppingRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-requests"] });
    },
  });
}
