"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPrintingService,
  deletePrintingService,
  fetchPrintingServices,
  updatePrintingService,
} from "../api/printing-services-api";
import type { PrintingServiceInput } from "../types";

export function usePrintingServices(search: string) {
  return useQuery({
    queryKey: ["printing-services", { search }],
    queryFn: () => fetchPrintingServices({ search, page: 1, limit: 100 }),
  });
}

export function useCreatePrintingService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPrintingService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["printing-services"] });
    },
  });
}

export function useUpdatePrintingService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updatePrintingService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["printing-services"] });
    },
  });
}

export function useDeletePrintingService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePrintingService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["printing-services"] });
    },
  });
}

export type { PrintingServiceInput };
