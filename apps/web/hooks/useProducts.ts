"use client";

import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "./useDebounce";
import type { ProductStockStatusFilter } from "@/features/pos-search/pos-stock-filter";

export interface ProductVariant {
  id: string;
  unit: string;
  price: number;
  costPrice: number | null;
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
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  price: number;
  costPrice: number | null;
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
  category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
  };
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
  page?: number;
  limit?: number;
  inStockOnly?: boolean;
  stockStatus?: ProductStockStatusFilter;
  stockGroupMinVariants?: number;
  initialData?: ProductsResponse;
}

async function fetchProducts(
  search?: string,
  categoryId?: string,
  page = 1,
  limit = 100,
  inStockOnly = false,
  stockStatus?: ProductStockStatusFilter,
  stockGroupMinVariants?: number,
): Promise<ProductsResponse> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (categoryId) params.set("categoryId", categoryId);
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (inStockOnly) params.set("inStockOnly", "true");
  if (stockStatus && stockStatus !== "all") {
    params.set("stockStatus", stockStatus);
  }
  if (stockGroupMinVariants && stockGroupMinVariants > 0) {
    params.set("stockGroupMinVariants", String(stockGroupMinVariants));
  }

  const res = await fetch(`/api/products?${params.toString()}`);
  if (!res.ok) {
    const { getCachedCatalogProducts } = await import("@/lib/offline/offline-db");
    const cached = await getCachedCatalogProducts<Product>(
      search,
      categoryId,
      inStockOnly,
    );
    if (cached.length > 0) {
      return {
        data: cached,
        pagination: {
          total: cached.length,
          page: 1,
          limit: cached.length,
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
  await cacheCatalogProducts(response.data);
  return response;
}

async function fetchCategories(): Promise<Category[]> {
  const res = await fetch("/api/categories");
  if (!res.ok) {
    const { getCachedCatalogCategories } = await import("@/lib/offline/offline-db");
    const cached = await getCachedCatalogCategories<Category>();
    if (cached.length > 0) return cached;
    throw new Error("Failed to fetch categories");
  }
  const json = (await res.json()) as { data: Category[] };
  const { cacheCatalogCategories } = await import("@/lib/offline/offline-db");
  await cacheCatalogCategories(json.data);
  return json.data;
}

export function useCategories(initialData?: Category[]) {
  return useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    initialData,
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
    queryKey: [
      "products",
      debouncedSearch,
      categoryId,
      page,
      limit,
      inStockOnly,
      stockStatus,
      options.stockGroupMinVariants,
    ],
    queryFn: () =>
      fetchProducts(
        debouncedSearch,
        categoryId,
        page,
        limit,
        inStockOnly,
        stockStatus,
        options.stockGroupMinVariants,
      ),
    select: (data) => data.data,
    placeholderData: keepPreviousData,
  });
}

export interface ProductStats {
  totalProducts: number;
  lowStock: number;
  negativeStock: number;
  inventoryValue: number;
}

async function fetchProductStats(
  search?: string,
  categoryId?: string,
): Promise<ProductStats> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (categoryId) params.set("categoryId", categoryId);

  const res = await fetch(`/api/products/stats?${params.toString()}`);
  if (!res.ok) {
    throw new Error("Failed to fetch product stats");
  }

  return res.json();
}

export function useProductStats(search?: string, categoryId?: string) {
  const debouncedSearch = useDebounce(search?.trim() || "", 300);

  return useQuery({
    queryKey: ["product-stats", debouncedSearch, categoryId],
    queryFn: () => fetchProductStats(debouncedSearch, categoryId),
  });
}

export interface CreateProductInput {
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
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-price-logs"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-price-logs"] });
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
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
  options: UseProductsOptions = {},
) {
  const { page = 1, limit = 100, inStockOnly = false, stockStatus } = options;
  const debouncedSearch = useDebounce(search?.trim() || "", 300);

  return useQuery({
    queryKey: [
      "products",
      debouncedSearch,
      categoryId,
      page,
      limit,
      inStockOnly,
      stockStatus,
      options.stockGroupMinVariants,
    ],
    queryFn: () =>
      fetchProducts(
        debouncedSearch,
        categoryId,
        page,
        limit,
        inStockOnly,
        stockStatus,
        options.stockGroupMinVariants,
      ),
    placeholderData: keepPreviousData,
  });
}
