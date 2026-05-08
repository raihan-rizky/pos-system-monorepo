"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "./useDebounce";

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  costPrice: number | null;
  stock: number;
  minStock: number;
  unit: string;
  size: string | null;
  material: string | null;
  imageUrl: string | null;
  isActive: boolean;
  category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
  };
}

export interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  _count: { products: number };
}

async function fetchProducts(
  search?: string,
  categoryId?: string
): Promise<Product[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (categoryId) params.set("categoryId", categoryId);

  const res = await fetch(`/api/products?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch products");
  return res.json();
}

async function fetchCategories(): Promise<Category[]> {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error("Failed to fetch categories");
  return res.json();
}

export function useProducts(search?: string, categoryId?: string) {
  const debouncedSearch = useDebounce(search?.trim() || "", 300);

  return useQuery({
    queryKey: ["products", debouncedSearch, categoryId],
    queryFn: () => fetchProducts(debouncedSearch, categoryId),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
}

export interface CreateProductInput {
  name: string;
  sku: string;
  costPrice?: number;
  price: number;
  stock: number;
  unit: string;
  categoryId: string;
  size?: string;
  material?: string;
  imageUrl?: string;
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
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export interface UpdateProductInput extends Partial<CreateProductInput> {
  id: string;
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
  return res.json();
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

export interface UpdateStockInput {
  productId: string;
  type: "IN" | "OUT" | "ADJUSTMENT";
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
    },
  });
}

