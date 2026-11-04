"use client";

import { useQuery } from "@tanstack/react-query";

export function usePriceRoundingCategories(enabled: boolean) {
  return useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["settings", "price-rounding", "categories"],
    enabled,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/settings/price-rounding/categories", { cache: "no-store", signal });
      if (!response.ok) throw new Error("Kategori belum dapat dimuat.");
      return response.json();
    },
  });
}
