"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  commitSupplierImport,
  previewSupplierImport,
} from "../api/supplierImportApi";

export function useSupplierImportPreview() {
  return useMutation({ mutationFn: previewSupplierImport });
}

export function useSupplierImportCommit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: commitSupplierImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}
