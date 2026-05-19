"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface UseBulkDeleteReturn {
  selectedProductIds: Set<string>;
  showConfirmation: boolean;
  isDeleting: boolean;
  toggleProduct: (productId: string) => void;
  clearSelection: () => void;
  requestDelete: () => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
}

async function deleteProducts(productIds: string[]): Promise<void> {
  const params = new URLSearchParams({ ids: productIds.join(",") });
  const res = await fetch(`/api/products?${params.toString()}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to delete products");
  }
}

export function useBulkDelete(): UseBulkDeleteReturn {
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [showConfirmation, setShowConfirmation] = useState(false);
  const queryClient = useQueryClient();

  const deleteProductsMutation = useMutation({
    mutationFn: deleteProducts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setSelectedProductIds(new Set());
      setShowConfirmation(false);
    },
  });

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const clearSelection = () => {
    setSelectedProductIds(new Set());
  };

  const requestDelete = () => {
    if (selectedProductIds.size > 0) {
      setShowConfirmation(true);
    }
  };

  const cancelDelete = () => {
    setShowConfirmation(false);
  };

  const confirmDelete = async () => {
    await deleteProductsMutation.mutateAsync(Array.from(selectedProductIds));
  };

  return {
    selectedProductIds,
    showConfirmation,
    isDeleting: deleteProductsMutation.isPending,
    toggleProduct,
    clearSelection,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}
