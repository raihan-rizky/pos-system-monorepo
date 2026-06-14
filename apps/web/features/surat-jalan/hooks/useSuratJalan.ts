import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveSuratJalan,
  createSuratJalan,
  fetchSuratJalanBundle,
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
    },
  });
}
