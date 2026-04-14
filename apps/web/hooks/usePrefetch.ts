"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

async function fetchProducts() {
  const res = await fetch("/api/products");
  if (!res.ok) throw new Error("Failed to prefetch products");
  return res.json();
}

async function fetchCategories() {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error("Failed to prefetch categories");
  return res.json();
}

async function fetchActiveShift() {
  const res = await fetch("/api/shifts/active");
  if (!res.ok) throw new Error("Failed to prefetch shift");
  return res.json();
}

/**
 * useAppPrefetch — warm up the React Query cache on app mount so the first
 * time the user visits /pos (or returns to it) the data is already available.
 *
 * Call this once in the root layout or providers component.
 */
export function useAppPrefetch() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Small delay so the first page's own data load gets priority
    const timer = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ["products", "", ""],
        queryFn: fetchProducts,
        staleTime: 5 * 60 * 1000,
      });
      queryClient.prefetchQuery({
        queryKey: ["categories"],
        queryFn: fetchCategories,
        staleTime: 5 * 60 * 1000,
      });
      queryClient.prefetchQuery({
        queryKey: ["active-shift"],
        queryFn: fetchActiveShift,
        staleTime: 60 * 1000,
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [queryClient]);
}
