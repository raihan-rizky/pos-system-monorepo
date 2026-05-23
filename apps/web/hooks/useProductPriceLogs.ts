"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

export type ProductPriceLogField = "PRICE" | "COST_PRICE";
export type ProductPriceLogSource = "MANUAL" | "IMPORT" | "API" | "SYSTEM";

export interface ProductPriceLog {
  id: string;
  productId: string;
  storeId: string;
  field: ProductPriceLogField;
  oldValue: string | null;
  newValue: string | null;
  source: ProductPriceLogSource;
  note: string | null;
  changedBy: string | null;
  changedByName: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    sku: string;
    category: {
      name: string;
      icon: string | null;
    };
  };
}

export interface ProductPriceLogsResponse {
  data: ProductPriceLog[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export type ProductPriceLogsParams = {
  page?: number;
  limit?: number;
  productId?: string;
  field?: ProductPriceLogField | "";
  source?: ProductPriceLogSource | "";
  from?: string;
  to?: string;
};

async function fetchProductPriceLogs(
  params: ProductPriceLogsParams,
): Promise<ProductPriceLogsResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(params.page ?? 1));
  searchParams.set("limit", String(params.limit ?? 50));
  if (params.productId) searchParams.set("productId", params.productId);
  if (params.field) searchParams.set("field", params.field);
  if (params.source) searchParams.set("source", params.source);
  if (params.from) searchParams.set("from", params.from);
  if (params.to) searchParams.set("to", params.to);

  const res = await fetch(`/api/products/price-logs?${searchParams.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch product price logs");
  return res.json();
}

export function useProductPriceLogs(params: ProductPriceLogsParams = {}) {
  return useQuery({
    queryKey: ["product-price-logs", params],
    queryFn: () => fetchProductPriceLogs(params),
    placeholderData: keepPreviousData,
  });
}
