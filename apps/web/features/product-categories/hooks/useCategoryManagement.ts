"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { CategoryAction, CategoryActionResult, DeletePreview, ManagedCategory, MovePreview } from "../types";

type ActionResponse = CategoryActionResult | DeletePreview | MovePreview;
export class CategoryRequestError extends Error {
  constructor(message: string, public status: number, public code?: string, public errors?: Record<string, string[]>) {
    super(message);
  }
}

export function categoryRowErrors(error: unknown, index: number): string[] {
  if (!(error instanceof CategoryRequestError)) return [];
  return Object.entries(error.errors ?? {}).filter(([path]) => path === `categories.${index}` || path.startsWith(`categories.${index}.`)).flatMap(([, messages]) => messages);
}

export async function requestCategoryAction(input: CategoryAction): Promise<ActionResponse> {
  const response = await fetch("/api/categories/manage", {
    method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }).catch(() => { throw new CategoryRequestError("Permintaan belum berhasil. Periksa koneksi internet, muat ulang data untuk memastikan hasil perubahan, lalu coba lagi.", 0); });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new CategoryRequestError(data?.message ?? "Perubahan kategori belum berhasil. Silakan coba lagi.", response.status, data?.code, data?.errors);
  return data as ActionResponse;
}

export async function invalidateCategoryCatalog(client: QueryClient) {
  await Promise.all([client.cancelQueries({ queryKey: ["products"] }), client.cancelQueries({ queryKey: ["categories"] })]);
  let offlineCleared = true;
  try {
    const { offlineDb } = await import("@/lib/offline/offline-db");
    await offlineDb.transaction("rw", [offlineDb.catalogProducts, offlineDb.catalogCategories], async () => {
      await offlineDb.catalogProducts.clear();
      await offlineDb.catalogCategories.clear();
    });
  } catch {
    offlineCleared = false;
  }
  await Promise.all(["categories", "products", "product-stats", "customer-category-pricing-rules", "pricing-scope-units", "pricing-scope-options"].map(key => client.invalidateQueries({ queryKey: [key] })));
  return offlineCleared;
}

export function useManagedCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async ({ signal }): Promise<ManagedCategory[]> => {
      const response = await fetch("/api/categories", { cache: "no-store", signal });
      if (!response.ok) throw new Error("Daftar kategori belum bisa dimuat. Silakan coba lagi.");
      const data = await response.json() as { data: ManagedCategory[] };
      return data.data;
    },
  });
}

export function useCategoryManagement() {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: CategoryAction): Promise<ActionResponse> => {
      const result = await requestCategoryAction(input);
      if (input.action === "preview-delete" || input.action === "preview-move") return result;
      const cleared = await invalidateCategoryCatalog(client);
      if (!cleared && "message" in result) return { ...result, message: `${result.message} Cache offline belum berhasil diperbarui. Tetap gunakan koneksi internet sampai katalog dimuat ulang.` };
      return result;
    },
  });
  return { ...mutation, execute: <T extends ActionResponse = CategoryActionResult>(input: CategoryAction) => mutation.mutateAsync(input) as Promise<T> };
}
