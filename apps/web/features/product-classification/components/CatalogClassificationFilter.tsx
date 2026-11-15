"use client";

import { useQuery } from "@tanstack/react-query";
import type { Product, UseProductsOptions } from "@/hooks/useProducts";
import type { OfflineCatalogIdentity } from "@/lib/offline/offline-db";
import type { CatalogSubcategory } from "../types";

type CatalogResponse = { subcategories: CatalogSubcategory[]; legacyCategories: { id: string; name: string }[] };
type CatalogGroupFilter = NonNullable<UseProductsOptions["catalogGroup"]> | "";

export async function fetchClassificationCatalog(signal?: AbortSignal, identity?: OfflineCatalogIdentity): Promise<CatalogResponse> {
  let response: Response | undefined;
  try {
    response = await fetch("/api/product-classification", { signal, cache: "no-store" });
  } catch (error) {
    signal?.throwIfAborted();
    if (!(error instanceof TypeError)) throw error;
  }
  signal?.throwIfAborted();
  if (response?.status === 401 || response?.status === 403) throw new Error("Akses kategori tidak tersedia.");
  if (response?.ok) return response.json() as Promise<CatalogResponse>;

  const { getCachedCatalogProducts } = await import("@/lib/offline/offline-db");
  const products = await getCachedCatalogProducts<Product>(undefined, undefined, false, identity);
  signal?.throwIfAborted();
  const subcategories = new Map<string, CatalogSubcategory>();
  for (const product of products) {
    for (const item of [product, ...(product.variants ?? [])]) {
      const category = item.catalogSubcategory;
      if (category) subcategories.set(category.id, { ...category, legacyCategoryId: category.legacyCategoryId ?? null });
    }
  }
  return { subcategories: [...subcategories.values()].sort((a, b) => a.name.localeCompare(b.name)), legacyCategories: [] };
}

export function CatalogClassificationFilter({ idPrefix, group, subcategoryId, onChange, offlineIdentity }: {
  idPrefix: string;
  group: CatalogGroupFilter;
  subcategoryId: string;
  onChange: (group: CatalogGroupFilter, subcategoryId: string) => void;
  offlineIdentity?: OfflineCatalogIdentity;
}) {
  const catalog = useQuery({
    queryKey: offlineIdentity
      ? ["product-classification", "catalog", offlineIdentity.cashierId, offlineIdentity.storeId]
      : ["product-classification", "catalog"],
    networkMode: "always",
    queryFn: ({ signal }) => fetchClassificationCatalog(signal, offlineIdentity),
  });
  const subcategories = (catalog.data?.subcategories ?? []).filter((item) => item.group === group);
  const selectClass = "min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600";
  return (
    <div className="flex flex-wrap items-end gap-3 px-5 py-3 md:px-6">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-catalog-group`} className="text-xs font-semibold text-slate-600">Kategori produk</label>
        <select id={`${idPrefix}-catalog-group`} className={selectClass} value={group}
          onChange={(event) => onChange(event.target.value as CatalogGroupFilter, "")}>
          <option value="">Semua kategori</option>
          <option value="ATK">ATK</option>
          <option value="PERCETAKAN">PERCETAKAN</option>
          <option value="UNCLASSIFIED">Belum diatur</option>
        </select>
      </div>
      {(group === "ATK" || group === "PERCETAKAN") && <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-catalog-subcategory`} className="text-xs font-semibold text-slate-600">Subkategori produk</label>
        <select id={`${idPrefix}-catalog-subcategory`} className={selectClass} value={subcategoryId}
          onChange={(event) => onChange(group, event.target.value)}>
          <option value="">Semua subkategori</option>
          {subcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>}
      {catalog.isError && <span role="status" className="text-sm text-red-700">Daftar subkategori belum dapat dimuat.</span>}
    </div>
  );
}
