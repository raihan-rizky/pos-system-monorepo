"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createSupplier,
  deactivateSupplier,
  getSupplierStockInRecap,
  getSupplierSummary,
  listSuppliers,
  reactivateSupplier,
  updateSupplier,
  type SupplierListFilters,
} from "@/features/suppliers/api/suppliers-api";
import type { SupplierInput } from "@/features/suppliers/types/supplier";

export function useSuppliers(filters: SupplierListFilters) {
  return useQuery({
    queryKey: ["suppliers", filters],
    queryFn: () => listSuppliers(filters),
    staleTime: 30_000,
  });
}

export function useSupplierSummary(filters: {
  from?: string;
  to?: string;
  supplierId?: string;
}) {
  return useQuery({
    queryKey: ["suppliers", "summary", filters],
    queryFn: () => getSupplierSummary(filters),
    staleTime: 30_000,
  });
}

export function useSupplierStockInRecap(filters: {
  from?: string;
  to?: string;
  supplierId?: string;
  productId?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["suppliers", "stock-in-recap", filters],
    queryFn: () => getSupplierStockInRecap(filters),
    staleTime: 15_000,
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSupplier,
    onSuccess: () => invalidateSupplierQueries(queryClient),
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SupplierInput }) =>
      updateSupplier(id, input),
    onSuccess: () => invalidateSupplierQueries(queryClient),
  });
}

export function useSetSupplierActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? reactivateSupplier(id) : deactivateSupplier(id),
    onSuccess: () => invalidateSupplierQueries(queryClient),
  });
}

function invalidateSupplierQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: ["suppliers"] });
}
