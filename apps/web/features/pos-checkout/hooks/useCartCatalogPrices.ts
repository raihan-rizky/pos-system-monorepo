"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CartItem } from "@/hooks/useCart";
import type { Product } from "@/hooks/useProducts";
import { refreshCartCatalogPrices } from "../helpers/cart-catalog-pricing";

export function useCartCatalogPrices(items: CartItem[], enabled = true) {
  const ids = useMemo(
    () => [...new Set(items.flatMap(item => item.lineType === "PRODUCT" ? [item.productId, ...(item.unitOptions?.map(o => o.productId) ?? [])] : []))].sort(),
    [items],
  );
  const query = useQuery({
    queryKey: ["products", "cart-pricing", ids],
    enabled: enabled && ids.length > 0,
    staleTime: 0,
    refetchInterval: 30_000,
    queryFn: async () => Promise.all(ids.map(async id => {
      const response = await fetch(`/api/products/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error("Harga terbaru belum dapat dimuat");
      const json = await response.json() as { data: Product };
      return json.data;
    })),
  });
  return useMemo(
    () => refreshCartCatalogPrices(items, query.data ?? []),
    [items, query.data],
  );
}
