"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";

const POS_PREFETCH_PAGE_SIZE = 24;

async function fetchPosProductsPage() {
  const params = new URLSearchParams({
    page: "1",
    limit: String(POS_PREFETCH_PAGE_SIZE),
  });
  const res = await fetch(`/api/products?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to prefetch products");
  return res.json();
}

async function fetchCategories() {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error("Failed to prefetch categories");
  const json = await res.json();
  return json.data ?? [];
}

async function fetchActiveShift() {
  const res = await fetch("/api/shifts?active=true");
  if (!res.ok) throw new Error("Failed to prefetch shift");
  const json = await res.json();
  return json.data ?? null;
}

/**
 * useAppPrefetch — warm up the React Query cache on app mount so the first
 * time the user visits /pos (or returns to it) the data is already available.
 *
 * Call this once in the root layout or providers component.
 */
export function useAppPrefetch(enabled = true) {
  const queryClient = useQueryClient();
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled) return;
    const isPosPage = pathname === "/pos" || pathname.startsWith("/pos/");

    // Run after the first page's own data load and hydration have priority.
    const timer = setTimeout(() => {
      if (!isPosPage) {
        queryClient.prefetchQuery({
          queryKey: [
            "products",
            "page",
            "",
            "",
            1,
            POS_PREFETCH_PAGE_SIZE,
            false,
          ],
          queryFn: fetchPosProductsPage,
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
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [enabled, pathname, queryClient]);
}
