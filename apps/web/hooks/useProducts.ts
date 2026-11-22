"use client";

import { invalidatePricingQueries } from "@/features/product-stock-groups/invalidate-pricing-queries";
import { useEffect } from "react";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "./useDebounce";
import { matchesStockFilter, type ProductStockStatusFilter } from "@/features/pos-search/pos-stock-filter";
import { matchesPosCatalogFilter } from "@/features/pos-search/pos-catalog-filter";
import { matchesSearchTokens, parseSearchQuery } from "@/features/pos-search/pos-search";
import type { AppliedCategoryPricing } from "@/features/customer-category-pricing/helpers/pricing-rules";
import type { PriceRoundingResult } from "@/features/product-price-rounding/rounding";
import type { OfflineCatalogIdentity } from "@/lib/offline/offline-db";

type ProductCategoryClassification = {
  id: string;
  group: "ATK" | "PERCETAKAN";
  name: string;
  legacyCategoryId?: string | null;
};
type ProductCategory = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  catalogSubcategory?: ProductCategoryClassification | null;
};

export interface ProductVariant {
  catalogSubcategoryId?: string | null;
  catalogSubcategory?: ProductCategoryClassification | null;
  category?: ProductCategory;
  priceRounding?: PriceRoundingResult | null;
  description?: string | null;
  displayPrice?: number;
  appliedPricing?: AppliedCategoryPricing | null;
  id: string;
  unit: string;
  price: number;
  costPrice: number | null;
  baseCostPrice?: number | null;
  baseCostUnit?: string | null;
  stock: number;
  sku: string;
  brandId?: string | null;
  brand?: {
    id: string;
    name: string;
    normalizedName?: string;
  } | null;
  unitMultiplierToBase?: number;
  stockGroup?: {
    id: string;
    displayName: string;
    baseUnit: string;
    baseStock: number;
  } | null;
  hargaDinas: number | null;
  hargaAgen: number | null;
  barcode?: string | null;
  size?: string | null;
  material?: string | null;
}

export interface Product {
  catalogSubcategoryId?: string | null;
  catalogSubcategory?: ProductCategoryClassification | null;
  priceRounding?: PriceRoundingResult | null;
  description?: string | null;
  displayPrice?: number;
  appliedPricing?: AppliedCategoryPricing | null;
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  price: number;
  costPrice: number | null;
  baseCostPrice?: number | null;
  baseCostUnit?: string | null;
  hargaDinas: number | null;
  hargaAgen: number | null;
  stock: number;
  minStock: number;
  unit: string;
  size: string | null;
  material: string | null;
  imageUrl: string | null;
  isActive: boolean;
  stockGroupId?: string | null;
  unitMultiplierToBase?: number;
  conversionNeedsReview?: boolean;
  stockGroup?: {
    id: string;
    displayName: string;
    baseUnit: string;
    baseStock: number;
  } | null;
  category: ProductCategory;
  brandId?: string | null;
  brand?: {
    id: string;
    name: string;
    normalizedName?: string;
  } | null;
  defaultVariant?: {
    id: string;
    unit: string;
    price: number;
    stock: number;
    sku: string;
  };
  variants?: ProductVariant[];
}

export interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  _count: { products: number };
}

export interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ProductsResponse {
  data: Product[];
  pagination: PaginationInfo;
}

export interface UseProductsOptions {
  catalogGroup?: "ATK" | "PERCETAKAN" | "UNCLASSIFIED";
  catalogSubcategoryId?: string;
  unit?: string;
  page?: number;
  limit?: number;
  inStockOnly?: boolean;
  stockStatus?: ProductStockStatusFilter;
  stockGroupMinVariants?: number;
  initialData?: ProductsResponse;
  initialDataUpdatedAt?: number;
  offlineIdentity?: OfflineCatalogIdentity;
}

export function productQueryKey(
  search?: string,
  categoryId?: string,
  options: UseProductsOptions = {},
) {
  return [
    "products",
    search?.trim() || "",
    categoryId || "",
    options.page ?? 1,
    options.limit ?? 100,
    options.inStockOnly ?? false,
    options.stockStatus === "all" ? undefined : options.stockStatus,
    options.stockGroupMinVariants || undefined,
    ...(options.unit?.trim() ? [options.unit.trim().toLowerCase()] : []),
    ...(options.catalogGroup || options.catalogSubcategoryId ? ["classification", options.catalogGroup || "", options.catalogSubcategoryId || ""] : []),
    ...(options.offlineIdentity ? ["offline-identity", options.offlineIdentity.cashierId, options.offlineIdentity.storeId] : []),
  ] as const;
}

export async function fetchProducts(
  search?: string,
  categoryId?: string,
  page = 1,
  limit = 100,
  inStockOnly = false,
  stockStatus?: ProductStockStatusFilter,
  stockGroupMinVariants?: number,
  signal?: AbortSignal,
  unit?: string,
  offlineIdentity?: OfflineCatalogIdentity,
  catalogGroup?: UseProductsOptions["catalogGroup"],
  catalogSubcategoryId?: string,
): Promise<ProductsResponse> {
  const params = new URLSearchParams();
  const normalizedUnit = unit?.trim().toLowerCase() || "";
  if (normalizedUnit) params.set("unit", normalizedUnit);
  if (search) params.set("search", search);
  if (categoryId) params.set("categoryId", categoryId);
  if (catalogGroup) params.set("catalogGroup", catalogGroup);
  if (catalogSubcategoryId) params.set("catalogSubcategoryId", catalogSubcategoryId);
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (inStockOnly) params.set("inStockOnly", "true");
  if (stockStatus && stockStatus !== "all") {
    params.set("stockStatus", stockStatus);
  }
  if (stockGroupMinVariants && stockGroupMinVariants > 0) {
    params.set("stockGroupMinVariants", String(stockGroupMinVariants));
  }

  let res: Response | undefined;
  try {
    res = await fetch(`/api/products?${params.toString()}`, { signal, cache: "no-store" });
  } catch (error) {
    signal?.throwIfAborted();
    if (!(error instanceof TypeError)) throw error;
  }
  signal?.throwIfAborted();
  if (res?.status === 401 || res?.status === 403) {
    throw new Error("Akses katalog tidak tersedia. Masuk kembali atau hubungi pengelola.");
  }
  if (!res?.ok) {
    const { getCachedCatalogProducts } = await import("@/lib/offline/offline-db");
    signal?.throwIfAborted();
    const cachedProducts = await getCachedCatalogProducts<Product>(
      catalogGroup || catalogSubcategoryId ? undefined : search,
      categoryId,
      normalizedUnit || catalogGroup || catalogSubcategoryId || (stockStatus && stockStatus !== "all") ? false : inStockOnly,
      offlineIdentity,
    );
    signal?.throwIfAborted();
    // A verified cashier snapshot can legitimately contain no matching rows.
    if (cachedProducts.length > 0 || offlineIdentity) {
      const classificationFilter = {
        group: catalogGroup === "ATK" || catalogGroup === "PERCETAKAN" ? catalogGroup : undefined,
        subcategoryId: catalogSubcategoryId || undefined,
      };
      const cached = normalizedUnit || catalogGroup || catalogSubcategoryId || (stockStatus && stockStatus !== "all")
        ? cachedProducts.flatMap((product) => {
            const candidates = product.variants?.length ? product.variants : [product];
            const matches = candidates.filter((variant) => {
              const candidate = { ...product, ...variant, category: variant.category ?? product.category };
              if (normalizedUnit && variant.unit.trim().toLowerCase() !== normalizedUnit) return false;
              if (!matchesStockFilter({ stock: variant.stock }, inStockOnly)) return false;
              if (stockStatus === "negative" && !(variant.stock < 0)) return false;
              if (stockStatus === "out" && variant.stock !== 0) return false;
              if ((catalogGroup || catalogSubcategoryId) && !matchesSearchTokens({
                name: product.name, sku: variant.sku, barcode: variant.barcode,
                category: product.category, brand: variant.brand ?? product.brand,
              }, parseSearchQuery(search))) return false;
              if (catalogGroup === "UNCLASSIFIED" && variant.catalogSubcategoryId != null) return false;
              if (catalogGroup === "UNCLASSIFIED") return true;
              return (!classificationFilter.group && !classificationFilter.subcategoryId) || matchesPosCatalogFilter(candidate, classificationFilter);
            });
            const variant = matches.find((item) => item.id === product.id) ?? matches[0];
            if (!variant) return [];
            const variants = product.variants?.length ? matches : undefined;
            return [{ ...product, ...variant, category: variant.category ?? product.category, variants, defaultVariant: variant }];
          })
        : cachedProducts;
      return {
        data: cached,
        pagination: {
          total: cached.length,
          page: 1,
          limit: Math.max(1, cached.length),
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
    }
    throw new Error("Failed to fetch products");
  }
  const response = (await res.json()) as ProductsResponse;
  const { cacheCatalogProducts } = await import("@/lib/offline/offline-db");
  signal?.throwIfAborted();
  // Filtered groups omit sibling units and must not replace complete offline groups.
  if (!normalizedUnit && !catalogGroup && !catalogSubcategoryId) await cacheCatalogProducts(response.data, signal);
  signal?.throwIfAborted();
  return response;
}

async function fetchCategories(signal?: AbortSignal, offlineIdentity?: OfflineCatalogIdentity): Promise<Category[]> {
  signal?.throwIfAborted();
  let res: Response | undefined;
  try {
    res = await fetch("/api/categories", { cache: "no-store", signal });
  } catch (error) {
    signal?.throwIfAborted();
    if (!(error instanceof TypeError)) throw error;
  }
  signal?.throwIfAborted();
  if (res?.status === 401 || res?.status === 403) {
    throw new Error("Akses kategori tidak tersedia. Masuk kembali atau hubungi pengelola.");
  }
  if (!res?.ok) {
    const { getCachedCatalogCategories } = await import("@/lib/offline/offline-db");
    signal?.throwIfAborted();
    const cached = await getCachedCatalogCategories<Category>(offlineIdentity);
    signal?.throwIfAborted();
    if (cached.length > 0) return cached;
    throw new Error("Failed to fetch categories");
  }
  const json = (await res.json()) as { data: Category[] };
  const { cacheCatalogCategories } = await import("@/lib/offline/offline-db");
  signal?.throwIfAborted();
  await cacheCatalogCategories(json.data);
  signal?.throwIfAborted();
  return json.data;
}

export function useCategories(initialData?: Category[], offlineIdentity?: OfflineCatalogIdentity, enabled = true) {
  return useQuery({
    queryKey: offlineIdentity ? ["categories", offlineIdentity.cashierId, offlineIdentity.storeId] : ["categories"],
    enabled,
    networkMode: "always",
    queryFn: ({ signal }) => fetchCategories(signal, offlineIdentity),
    initialData: enabled ? initialData : undefined,
  });
}

export function useProductUnits() {
  return useQuery({
    queryKey: ["products", "units"],
    queryFn: async ({ signal }): Promise<string[]> => {
      const res = await fetch("/api/products/units", { signal });
      if (!res.ok) throw new Error("Daftar satuan belum bisa dimuat.");
      const json = (await res.json()) as { data: string[] };
      return json.data;
    },
  });
}

export function useProducts(
  search?: string,
  categoryId?: string,
  options: UseProductsOptions = {},
) {
  const { page = 1, limit = 100, inStockOnly = false, stockStatus } = options;
  const debouncedSearch = useDebounce(search?.trim() || "", 300);

  return useQuery({
    queryKey: productQueryKey(debouncedSearch, categoryId, options),
    queryFn: ({ signal }) =>
      fetchProducts(
        debouncedSearch,
        categoryId,
        page,
        limit,
        inStockOnly,
        stockStatus,
        options.stockGroupMinVariants,
        signal,
        options.unit,
        options.offlineIdentity,
        options.catalogGroup,
        options.catalogSubcategoryId,
      ),
    select: (data) => data.data,
    placeholderData: keepPreviousData,
  });
}

export interface ProductStats {
  totalProducts: number;
  lowStock: number;
  negativeStock: number;
  inventoryValue: number | null;
  inventoryUnvaluedCount?: number;
}

async function fetchProductStats(
  search?: string,
  categoryId?: string,
  classification?: Pick<UseProductsOptions, "catalogGroup" | "catalogSubcategoryId">,
): Promise<ProductStats> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (categoryId) params.set("categoryId", categoryId);
  if (classification?.catalogGroup) params.set("catalogGroup", classification.catalogGroup);
  if (classification?.catalogSubcategoryId) params.set("catalogSubcategoryId", classification.catalogSubcategoryId);

  const res = await fetch(`/api/products/stats?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to fetch product stats");
  }

  return res.json();
}

export function useProductStats(search?: string, categoryId?: string, classification?: Pick<UseProductsOptions, "catalogGroup" | "catalogSubcategoryId">) {
  const debouncedSearch = useDebounce(search?.trim() || "", 300);

  return useQuery({
    queryKey: ["product-stats", debouncedSearch, categoryId, classification?.catalogGroup, classification?.catalogSubcategoryId],
    queryFn: () => fetchProductStats(debouncedSearch, categoryId, classification),
  });
}

export interface CreateProductInput {
  catalogSubcategoryId?: string | null;
  additionalUnitVariants?: import("@/lib/product-form/product-unit-variants").AdditionalUnitInput[];
  name: string;
  sku: string;
  barcode?: string | null;
  description?: string | null;
  price: number;
  costPrice?: number | null;
  hargaDinas?: number | null;
  hargaAgen?: number | null;
  stock: number;
  unitMultiplierToBase?: number;
  minStock: number;
  unit: string;
  size?: string | null;
  categoryId: string;
  brandId?: string | null;
  material?: string;
  imageUrl?: string;
  smallestUnitVariant?: {
    unit: string;
    sku: string;
    barcode?: string | null;
    price: number;
    costPrice?: number | null;
    multiplierFromPackaging: number;
  };
}

async function createProduct(input: CreateProductInput): Promise<Product> {
  const res = await fetch("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to create product");
  }
  return res.json();
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      void invalidatePricingQueries(queryClient);
    },
  });
}

export interface UpdateProductInput extends Partial<CreateProductInput> {
  id: string;
  priceChangeNote?: string;
}

async function updateProduct(input: UpdateProductInput): Promise<Product> {
  const { id, ...data } = input;
  const res = await fetch(`/api/products/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to update product");
  }
  return res.json();
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProduct,
    onSuccess: () => {
      void invalidatePricingQueries(queryClient);
    },
  });
}

export interface UpdateProductGroupMetadataInput {
  id: string;
  name: string;
  description?: string | null;
  categoryId: string;
  brandId: string | null;
}

export interface ProductGroupMetadataResult {
  productIds: string[];
  name: string;
  description?: string | null;
  category: { id: string; name: string; icon?: string | null; color?: string | null };
  brand: { id: string; name: string; normalizedName?: string } | null;
}

async function updateProductGroupMetadata(
  input: UpdateProductGroupMetadataInput,
): Promise<ProductGroupMetadataResult> {
  const { id, ...metadata } = input;
  const response = await fetch(`/api/products/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...metadata, quickEditGroup: true }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message ?? "Gagal mengubah grup produk.");
  }
  return payload;
}

export function useUpdateProductGroupMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProductGroupMetadata,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

async function deleteProduct(id: string): Promise<void> {
  const res = await fetch(`/api/products/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to delete product");
  }
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      void invalidatePricingQueries(queryClient);
    },
  });
}

export interface BulkDeleteProductResultItem {
  id: string;
  status: "hard_deleted" | "soft_deleted" | "error";
  message?: string;
}

export interface BulkDeleteProductsResult {
  results: BulkDeleteProductResultItem[];
  summary: {
    total: number;
    hardDeleted: number;
    softDeleted: number;
    failed: number;
  };
}

async function bulkDeleteProducts(ids: string[]): Promise<BulkDeleteProductsResult> {
  const params = new URLSearchParams({ ids: ids.join(",") });
  const res = await fetch(`/api/products?${params.toString()}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 207) {
    const error = await res.json();
    throw new Error(error.message || "Failed to delete products");
  }
  return res.json();
}

export function useBulkDeleteProducts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bulkDeleteProducts,
    onSuccess: () => {
      void invalidatePricingQueries(queryClient);
    },
  });
}

export type InventoryReason =
  | "RESTOCK"
  | "SALE_RETURN"
  | "WASTE"
  | "USAGE"
  | "SUPPLIER_RETURN"
  | "OPNAME"
  | "MANUAL_ADJUSTMENT";

export interface UpdateStockInput {
  productId: string;
  type: "IN" | "OUT" | "ADJUSTMENT";
  reason: InventoryReason;
  quantity: number;
  note?: string;
}

async function updateStock(input: UpdateStockInput) {
  const res = await fetch("/api/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to record inventory");
  }
  return res.json();
}

export function useUpdateStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateStock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-logs"] });
    },
  });
}

export function useProductsPage(
  search?: string,
  categoryId?: string,
  options: UseProductsOptions & { enabled?: boolean } = {},
) {
  const { page = 1, limit = 100, inStockOnly = false, stockStatus, enabled = true } = options;
  const debouncedSearch = useDebounce(search?.trim() || "", 300);
  const queryClient = useQueryClient();
  const canUseInitialData =
    enabled &&
    !debouncedSearch &&
    !categoryId &&
    !inStockOnly &&
    (!stockStatus || stockStatus === "all") &&
    !options.stockGroupMinVariants &&
    !options.unit?.trim() &&
    !options.catalogGroup &&
    !options.catalogSubcategoryId &&
    options.initialData?.pagination.page === page &&
    options.initialData.pagination.limit === limit;
  const initialData = canUseInitialData ? options.initialData : undefined;

  useEffect(() => {
    if (!initialData) return;
    let current = true;
    const key = productQueryKey("", "", {
      page: initialData.pagination.page,
      limit: initialData.pagination.limit,
      offlineIdentity: options.offlineIdentity,
    });
    void import("@/lib/offline/offline-db")
      .then(({ cacheCatalogProducts }) => {
        if (current && queryClient.getQueryData(key) === initialData) {
          return cacheCatalogProducts(initialData.data);
        }
      })
      .catch(() => {
        // Optional offline storage must not block the server-loaded catalog.
      });
    return () => { current = false; };
  }, [initialData, queryClient, options.offlineIdentity?.cashierId, options.offlineIdentity?.storeId]);

  return useQuery({
    queryKey: productQueryKey(debouncedSearch, categoryId, options),
    enabled,
    networkMode: "always",
    queryFn: ({ signal }) =>
      fetchProducts(
        debouncedSearch,
        categoryId,
        page,
        limit,
        inStockOnly,
        stockStatus,
        options.stockGroupMinVariants,
        signal,
        options.unit,
        options.offlineIdentity,
        options.catalogGroup,
        options.catalogSubcategoryId,
      ),
    initialData,
    initialDataUpdatedAt: canUseInitialData ? options.initialDataUpdatedAt : undefined,
    placeholderData: keepPreviousData,
  });
}
