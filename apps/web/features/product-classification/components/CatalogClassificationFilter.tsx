"use client";

import { useQuery } from "@tanstack/react-query";
import type { Product, UseProductsOptions } from "@/hooks/useProducts";
import type { OfflineCatalogIdentity } from "@/lib/offline/offline-db";
import type { CatalogSubcategory } from "../types";
import { listCatalogSubcategories } from "../helpers/classification";

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
      const category = item.catalogSubcategoryId != null
        ? item.catalogSubcategory
        : item.catalogSubcategory ?? item.category?.catalogSubcategory;
      if (category) subcategories.set(category.id, { ...category, legacyCategoryId: category.legacyCategoryId ?? null });
    }
  }
  return { subcategories: [...subcategories.values()].sort((a, b) => a.name.localeCompare(b.name)), legacyCategories: [] };
}

export function CatalogClassificationFilter({ idPrefix, group, subcategoryId, onChange, offlineIdentity, includeUnclassified = true }: {
  idPrefix: string;
  group: CatalogGroupFilter;
  subcategoryId: string;
  onChange: (group: CatalogGroupFilter, subcategoryId: string) => void;
  offlineIdentity?: OfflineCatalogIdentity;
  includeUnclassified?: boolean;
}) {
  const catalog = useQuery({
    queryKey: offlineIdentity
      ? ["product-classification", "catalog", offlineIdentity.cashierId, offlineIdentity.storeId]
      : ["product-classification", "catalog"],
    networkMode: "always",
    queryFn: ({ signal }) => fetchClassificationCatalog(signal, offlineIdentity),
  });
  const groupSelected = group === "ATK" || group === "PERCETAKAN";
  const subcategories = groupSelected
    ? listCatalogSubcategories(group, catalog.data?.subcategories ?? [])
    : [];
  const selectClass = "mt-1.5 min-h-11 w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm font-semibold text-surface-800 shadow-sm outline-none transition-colors focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/25 disabled:cursor-not-allowed disabled:bg-surface-100 disabled:text-surface-400";
  return (
    <div className="grid w-full grid-cols-1 gap-3 px-3 py-3 md:px-6 sm:max-w-2xl sm:grid-cols-[minmax(10rem,0.8fr)_minmax(13rem,1.2fr)]">
      <label htmlFor={`${idPrefix}-catalog-group`} className="block min-w-0">
        <span className="mb-0.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-surface-500">
          <span className="font-mono text-brand-600">01</span>
          Kategori produk
        </span>
        <select id={`${idPrefix}-catalog-group`} aria-label="Kategori produk" className={selectClass} value={group}
          onChange={(event) => onChange(event.target.value as CatalogGroupFilter, "")}>
          <option value="">Semua kategori</option>
          {includeUnclassified && <option value="UNCLASSIFIED">Belum diatur</option>}
          <option value="ATK">ATK</option>
          <option value="PERCETAKAN">PERCETAKAN</option>
        </select>
      </label>
      <label htmlFor={`${idPrefix}-catalog-subcategory`} className="block min-w-0">
        <span className="mb-0.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-surface-500">
          <span className="font-mono text-brand-600">02</span>
          Subkategori
        </span>
        <select id={`${idPrefix}-catalog-subcategory`} aria-label="Subkategori" className={selectClass} value={groupSelected ? subcategoryId : ""} disabled={!groupSelected}
          onChange={(event) => onChange(group, event.target.value)}>
          <option value="">{groupSelected ? "Semua subkategori" : "Pilih kategori dahulu"}</option>
          {subcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {catalog.isError && <span role="status" className="text-sm text-danger-700 sm:col-span-2">Daftar subkategori belum dapat dimuat.</span>}
    </div>
  );
}
