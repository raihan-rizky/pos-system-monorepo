import type { PaginationMeta } from "@/lib/api/responses";

export interface StockGroupActivity {
  id: string;
  stockGroupId: string;
  productId?: string | null;
  type: string;
  note?: string | null;
  createdBy?: string | null;
  person?: string | null;
  createdAt: string;
  stockGroup?: {
    id: string;
    displayName: string;
  } | null;
  product?: {
    id: string;
    name: string;
    sku: string;
    unit: string;
  } | null;
}

export interface StockGroupActivityResponse {
  data: StockGroupActivity[];
  pagination: PaginationMeta;
}

export interface FetchStockGroupActivitiesParams {
  page: number;
  limit: number;
  search?: string;
}

export async function fetchStockGroupActivities({
  page,
  limit,
  search,
}: FetchStockGroupActivitiesParams): Promise<StockGroupActivityResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (search?.trim()) params.set("search", search.trim());

  const response = await fetch(`/api/product-stock-groups/activities?${params}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "Gagal memuat aktivitas grup");
  }
  return response.json() as Promise<StockGroupActivityResponse>;
}
