"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  approveDraft,
  cancelDraft,
  createDraft,
} from "../api/draft-api";

export function useCreateDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDraft,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
    },
  });
}

export function useApproveDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: approveDraft,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useCancelDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelDraft,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
    },
  });
}
