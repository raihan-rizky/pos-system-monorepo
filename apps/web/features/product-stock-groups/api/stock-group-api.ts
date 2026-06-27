export interface StockGroupDetail {
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
  price: number;
  costPrice?: number | null;
  priceChangeNote?: string;
}

export interface AddVariantPayload {
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

export async function fetchStockGroupDetail(groupId: string): Promise<StockGroupDetail> {
  const response = await fetch(`/api/product-stock-groups/${groupId}`);
  if (!response.ok) throw new Error("Gagal memuat stok unit");
  return response.json();
}

export async function updateSharedStock(groupId: string, payload: UpdateSharedStockPayload): Promise<void> {
  const res = await fetch(`/api/product-stock-groups/${groupId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorPayload = await res.json().catch(() => ({}));
    throw new Error(errorPayload.message || "Gagal menyimpan stok grup");
  }
}

export async function updateConversionRate(groupId: string, payload: UpdateConversionRatePayload): Promise<void> {
  const res = await fetch(`/api/product-stock-groups/${groupId}/conversion`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorPayload = await res.json().catch(() => ({}));
    throw new Error(errorPayload.message || "Gagal menyimpan conversion rate");
  }
}

export async function updateVariantPrice(groupId: string, productId: string, payload: UpdateVariantPricePayload): Promise<void> {
  const res = await fetch(`/api/product-stock-groups/${groupId}/products/${productId}/pricing`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorPayload = await res.json().catch(() => ({}));
    throw new Error(errorPayload.message || "Gagal menyimpan harga varian");
  }
}

export async function addVariant(groupId: string, payload: AddVariantPayload): Promise<void> {
  const res = await fetch(`/api/product-stock-groups/${groupId}/variants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorPayload = await res.json().catch(() => ({}));
    throw new Error(errorPayload.message || "Gagal menambah varian");
  }
}
