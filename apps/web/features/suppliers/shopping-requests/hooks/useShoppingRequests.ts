"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  listShoppingRequests,
  getShoppingRequest,
  createShoppingRequest,
  approveShoppingRequest,
  cancelShoppingRequest,
  type ShoppingRequestListParams,
} from "../api/shopping-requests-api";
import type {
  CreateShoppingRequestInput,
  ApproveShoppingRequestInput,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopping-requests"] });
    },
  });
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
