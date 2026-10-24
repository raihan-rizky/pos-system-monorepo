import type { GroupPricingProjection, PricingMode, ExactRatio } from "../automatic-pricing";
export interface StockGroupOption {
  id: string;
  displayName: string;
  baseUnit: string;
  baseStock: number;
  variantCount: number;
}

export class StockGroupMutationError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "StockGroupMutationError";
  }
}

export type StockGroupHistoryFilter = "activity" | "conversion";
export interface StockGroupHistoryRecord {
  id: string;
  type: string;
  createdAt: string;
  person?: string | null;
  createdBy?: string | null;
  note?: string | null;
  before?: unknown;
  after?: unknown;
}
export interface StockGroupHistoryResponse {
  data: StockGroupHistoryRecord[];
  pagination: import("@/lib/api/responses").PaginationMeta;
}
export async function fetchStockGroupHistory(
  groupId: string,
  filter: StockGroupHistoryFilter,
  page: number,
  signal?: AbortSignal,
): Promise<StockGroupHistoryResponse> {
  const params = new URLSearchParams({
    tab: filter,
    page: String(page),
    limit: "20",
  });
  const response = await fetch(
    `/api/product-stock-groups/${groupId}/history?${params}`,
    { signal },
  );
  if (!response.ok)
    throw new Error("Gagal memuat riwayat grup. Silakan coba lagi.");
  return response.json();
}

export async function fetchStockGroups(
  signal?: AbortSignal,
): Promise<StockGroupOption[]> {
  const response = await fetch(
    "/api/product-stock-groups?limit=100&minVariants=2",
    { signal },
  );
  if (!response.ok) throw new Error("Gagal memuat grup stok");
  const body = (await response.json()) as { data?: StockGroupOption[] };
  return body.data ?? [];
}

export interface StockGroupDetail {
  pricing?: GroupPricingProjection;
  pricingMembers?: Array<{ id: string; name: string; unit: string; isActive: boolean; unitMultiplierToBase: number; conversionNeedsReview: boolean }>;
  id: string;
  displayName: string;
  baseUnit: string;
  baseStock: number;
  hasNegativeStock: boolean;
  hasDuplicateUnits?: boolean;
  conversionPairs?: Array<{
    fromProductId: string;
    fromUnit: string;
    fromQuantity: number;
    toProductId: string;
    toUnit: string;
    toQuantity: number;
    label: string;
  }>;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    unit: string;
    unitMultiplierToBase: number;
    conversionNeedsReview: boolean;
    imageUrl?: string | null;
    category?: { name: string; icon?: string | null } | null;
    stock: number;
    price: number;
    costPrice?: number | null;
  }>;
}

export type StockInputMode = "BASE" | "VARIANT";

export interface UpdateSharedStockPayload {
  sharedStock: number;
  stockInput: { mode: "BASE" } | { mode: "VARIANT"; variantProductId: string };
  note?: string;
}

export interface UpdateConversionRatePayload {
  expectedVersion?: string;
  expectedProjection?: string;
  mode: "KEEP_SHARED_STOCK" | "PRESERVE_SOURCE_STOCK";
  baseProductId?: string;
  sourceProductId?: string;
  note?: string;
  conversionPairs?: Array<{
    fromProductId: string;
    fromQuantity: number;
    toProductId: string;
    toQuantity: number;
  }>;
  directMultipliers?: Array<{
    productId: string;
    unitMultiplierToBase: number;
  }>;
}

export interface UpdateVariantPricePayload {
  mode?: PricingMode;
  factor?: ExactRatio;
  price: number;
  costPrice?: number | null;
  priceChangeNote?: string;
}

export interface AddVariantPayload {
  pricingMode?: PricingMode;
  priceFactor?: ExactRatio;
  unit: string;
  price: number;
  costPrice?: number | null;
  stock: number;
  minStock: number;
  conversionPair?: {
    fromQuantity: number;
    toProductId: string;
    toQuantity: number;
  };
  note?: string;
}

export async function fetchStockGroupDetail(
  groupId: string,
  signal?: AbortSignal,
): Promise<StockGroupDetail> {
  const response = await fetch(`/api/product-stock-groups/${groupId}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Gagal memuat stok unit");
  return response.json();
}

export async function requestGroupPricing(
  groupId: string,
  changes: import("../group-pricing-service").GroupPricingChanges,
  preview?: import("../group-pricing-service").GroupPricingPreview,
): Promise<import("../group-pricing-service").GroupPricingPreview | GroupPricingProjection> {
  const response = await fetch(`/api/product-stock-groups/${groupId}/pricing`, {
    method: preview ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changes, ...(preview ? { expectedVersion: preview.version, expectedProjection: preview.projectionToken } : {}) }),
  });
  const body = await response.json();
  if (!response.ok) throw new StockGroupMutationError(body.message || "Harga grup belum dapat diproses.", response.status);
  return body;
}

export async function updateSharedStock(
  groupId: string,
  payload: UpdateSharedStockPayload,
): Promise<void> {
  const res = await fetch(`/api/product-stock-groups/${groupId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorPayload = await res.json().catch(() => ({}));
    throw new StockGroupMutationError(errorPayload.message || "Gagal menyimpan stok grup", res.status);
  }
}

export async function updateConversionRate(
  groupId: string,
  payload: UpdateConversionRatePayload,
): Promise<void> {
  const res = await fetch(`/api/product-stock-groups/${groupId}/conversion`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorPayload = await res.json().catch(() => ({}));
    throw new StockGroupMutationError(errorPayload.message || "Gagal menyimpan konversi satuan", res.status);
  }
}

export async function updateVariantPrice(
  groupId: string,
  productId: string,
  payload: UpdateVariantPricePayload,
): Promise<void> {
  const res = await fetch(
    `/api/product-stock-groups/${groupId}/products/${productId}/pricing`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const errorPayload = await res.json().catch(() => ({}));
    throw new StockGroupMutationError(errorPayload.message || "Gagal menyimpan harga satuan", res.status);
  }
}

export async function addVariant(
  groupId: string,
  payload: AddVariantPayload,
): Promise<void> {
  const res = await fetch(`/api/product-stock-groups/${groupId}/variants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorPayload = await res.json().catch(() => ({}));
    throw new StockGroupMutationError(errorPayload.message || "Gagal menambah satuan", res.status);
  }
}
