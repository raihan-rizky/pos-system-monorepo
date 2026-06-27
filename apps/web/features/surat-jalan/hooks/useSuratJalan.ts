import { useMutation, useQuery, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveSuratJalan,
  createSuratJalan,
  fetchSuratJalanBundle,
  fetchSuratJalans,
  type CreateSuratJalanInput,
} from "../api/surat-jalan-api";


export function suratJalanBundleKey(transactionId: string) {
  return ["surat-jalan", "bundle", transactionId] as const;
}

export function useSuratJalanBundle(transactionId: string, enabled = true) {
  return useQuery({
    queryKey: suratJalanBundleKey(transactionId),
    queryFn: () => fetchSuratJalanBundle(transactionId),
    enabled: enabled && Boolean(transactionId),
  });
}

export function useSuspenseSuratJalanBundle(transactionId: string) {
  return useSuspenseQuery({
    queryKey: suratJalanBundleKey(transactionId),
    queryFn: () => fetchSuratJalanBundle(transactionId),
  });
}

export function useCreateSuratJalan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSuratJalanInput) => createSuratJalan(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: suratJalanBundleKey(variables.transactionId),
      });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
    },
  });
}

export function useApproveSuratJalan(transactionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (suratJalanId: string) => approveSuratJalan(suratJalanId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: suratJalanBundleKey(transactionId),
      });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
    },
  });
}

export function useSuratJalans(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ["surat-jalans", limit, offset],
    queryFn: () => fetchSuratJalans(limit, offset),
  });
}

export function useGlobalApproveSuratJalan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (suratJalanId: string) => approveSuratJalan(suratJalanId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["surat-jalans"] });
      queryClient.invalidateQueries({ queryKey: ["surat-jalan"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
    },
  });
}

