"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidatePricingQueries } from "@/features/product-stock-groups/invalidate-pricing-queries";
import { ClassificationSubcategoryManager, type ClassificationManagementAction } from "./ClassificationSubcategoryManager";
import {
  ProductClassificationPanel,
  type ClassificationPreview,
  type ClassificationProductGroup,
  type ClassificationStatusFilter,
  type ClassificationSubcategory,
  type ProductClassificationGroup,
} from "./ProductClassificationPanel";

type CatalogResponse = { subcategories: ClassificationSubcategory[]; legacyCategories: { id: string; name: string }[] };
type ProductsResponse = { groups: ClassificationProductGroup[]; total: number; page: number; pageCount: number };
type MoveSnapshot = { productIds: string[]; subcategoryId: string; token: string };

class ClassificationRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ClassificationRequestError(
    typeof body.message === "string" ? body.message : "Permintaan belum berhasil. Silakan coba lagi.", response.status,
  );
  return body as T;
}

function sameIds(ids: readonly string[], selected: ReadonlySet<string>) {
  return ids.length === selected.size && new Set(ids).size === ids.length && ids.every(id => selected.has(id));
}

export function ProductClassificationContainer({
  canUpdate,
  canCreate = false,
  canDelete = false,
  headingAction,
}: {
  canUpdate: boolean;
  canCreate?: boolean;
  canDelete?: boolean;
  headingAction?: ReactNode;
}) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [legacyCategoryFilter, setLegacyCategory] = useState("");
  const [status, setStatus] = useState<ClassificationStatusFilter>("all");
  const [group, setGroup] = useState<ProductClassificationGroup | "">("");
  const [subcategory, setSubcategory] = useState("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState<ClassificationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [managementLoading, setManagementLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const selectionRef = useRef<ReadonlySet<string>>(selection);
  const previewRequest = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const snapshot = useRef<MoveSnapshot | null>(null);
  const applying = useRef(false);
  const managing = useRef(false);
  const mounted = useRef(false);

  const catalog = useQuery({
    queryKey: ["product-classification", "catalog"],
    queryFn: ({ signal }) => requestJson<CatalogResponse>("/api/product-classification", { signal }),
  });
  const legacyCategory = catalog.data && !catalog.data.legacyCategories.some(category => category.id === legacyCategoryFilter)
    ? ""
    : legacyCategoryFilter;
  const products = useQuery({
    queryKey: ["product-classification", "products", { search, legacyCategory, status, group, subcategory, page }],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ search, legacyCategoryId: legacyCategory, status, group, subcategoryId: subcategory, page: String(page), limit: "25" });
      return requestJson<ProductsResponse>(`/api/product-classification/products?${params}`, { signal });
    },
  });

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; sequence.current += 1; previewRequest.current?.abort(); };
  }, []);
  useEffect(() => {
    if (products.data && page > products.data.pageCount) setPage(Math.max(1, products.data.pageCount));
  }, [page, products.data]);
  useEffect(() => {
    if (!canUpdate) {
      sequence.current += 1;
      previewRequest.current?.abort();
      previewRequest.current = null;
      snapshot.current = null;
      selectionRef.current = new Set();
      setSelection(new Set());
      setPreview(null);
      setPreviewLoading(false);
    }
  }, [canUpdate]);

  function clearPreview() {
    sequence.current += 1;
    previewRequest.current?.abort();
    previewRequest.current = null;
    snapshot.current = null;
    setPreview(null);
    setPreviewLoading(false);
  }
  function changeSelection(next: Set<string>) {
    if (!canUpdate || applying.current) return;
    selectionRef.current = next;
    setSelection(next);
    clearPreview();
    setActionError(null);
    setSuccessMessage(null);
  }
  async function inspect(subcategoryId: string) {
    if (!canUpdate || applying.current || managing.current || selectionRef.current.size === 0) return;
    clearPreview();
    setActionError(null);
    setSuccessMessage(null);
    const productIds = [...selectionRef.current].sort();
    const controller = new AbortController();
    previewRequest.current = controller;
    const request = ++sequence.current;
    setPreviewLoading(true);
    try {
      const result = await requestJson<ClassificationPreview>("/api/product-classification/move", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ action: "preview", productIds, subcategoryId }),
      });
      if (!mounted.current || controller.signal.aborted || request !== sequence.current || !sameIds(productIds, selectionRef.current)) return;
      if (result.target.id !== subcategoryId || result.units.length !== productIds.length ||
        !sameIds(result.units.map(unit => unit.id), new Set(productIds))) {
        throw new Error("Pratinjau tidak cocok dengan pilihan. Silakan tinjau kembali.");
      }
      snapshot.current = { productIds, subcategoryId, token: result.token };
      setPreview(result);
    } catch (error) {
      if (!mounted.current || controller.signal.aborted || request !== sequence.current) return;
      setActionError(error instanceof Error ? error.message : "Tinjauan belum tersedia. Silakan coba lagi.");
    } finally {
      if (mounted.current && request === sequence.current) { previewRequest.current = null; setPreviewLoading(false); }
    }
  }
  async function apply(token: string) {
    const current = snapshot.current;
    if (!canUpdate || applying.current || managing.current || !current || !preview || token !== current.token ||
      preview.token !== token || preview.expiresAt <= Date.now() || !preview.pricingImpact ||
      !preview.totals.moving || !sameIds(current.productIds, selectionRef.current)) return;
    applying.current = true;
    setApplyLoading(true);
    setActionError(null);
    try {
      const result = await requestJson<{ moved: number; unchanged: number }>("/api/product-classification/move", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", ...current }),
      });
      // The write may finish after the panel unmounts; still invalidate all dependent views.
      void invalidateRelated();
      snapshot.current = null;
      selectionRef.current = new Set();
      if (mounted.current) {
        setSelection(new Set());
        setPreview(null);
        setSuccessMessage(`${result.moved} satuan berhasil dipindahkan. ${result.unchanged} satuan sudah di tujuan.`);
      }
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ClassificationRequestError && error.status === 409) {
        snapshot.current = null;
        setPreview(null);
      }
      setActionError(error instanceof Error ? error.message : "Satuan belum berhasil dipindahkan. Silakan coba lagi.");
    } finally {
      applying.current = false;
      if (mounted.current) setApplyLoading(false);
    }
  }

  function invalidateRelated() {
    void invalidatePricingQueries(client);
    for (const key of ["financial-report", "daily-financial-report", "monthly-financial-report", "customer-category-pricing-rules", "pricing-scope-units", "pricing-scope-options"]) {
      void client.invalidateQueries({ queryKey: [key] });
    }
    return client.invalidateQueries({ queryKey: ["product-classification"] });
  }

  async function manage(action: ClassificationManagementAction) {
    if (managing.current || applying.current || previewLoading ||
      (action.action === "create" && !canCreate) || (action.action === "update" && !canUpdate) ||
      (action.action === "delete" && !canDelete)) throw new Error("Tindakan ini tidak tersedia untuk akun Anda.");
    if (action.action !== "create" && !catalog.data?.subcategories.some(item => item.id === action.id && item.group === "ATK")) {
      throw new Error("Subkategori ATK tidak ditemukan. Muat ulang dan coba lagi.");
    }
    managing.current = true;
    setManagementLoading(true);
    try {
      await requestJson("/api/product-classification/manage", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action),
      });
      if (mounted.current) clearPreview();
      await invalidateRelated();
    } finally {
      managing.current = false;
      if (mounted.current) setManagementLoading(false);
    }
  }

  const requestError = catalog.error || products.error;
  return <><ProductClassificationPanel
    headingAction={headingAction}
    groups={products.data?.groups ?? []} subcategories={catalog.data?.subcategories ?? []}
    selectedUnitIds={selection} onSelectionChange={changeSelection} canUpdate={canUpdate}
    search={search} onSearchChange={value => { setSearch(value); setPage(1); }}
    legacyCategories={catalog.data?.legacyCategories ?? []} legacyCategory={legacyCategory}
    onLegacyCategoryChange={value => { setLegacyCategory(value); setPage(1); }}
    classificationStatus={status} onClassificationStatusChange={value => { setStatus(value); setPage(1); }}
    filterMainCategory={group} onFilterMainCategoryChange={value => { setGroup(value); setPage(1); }}
    filterSubcategoryId={subcategory} onFilterSubcategoryChange={value => { setSubcategory(value); setPage(1); }}
    page={page} pageCount={products.data?.pageCount ?? 1} onPageChange={setPage}
    preview={preview} onPreview={inspect} onPreviewClose={() => { clearPreview(); setActionError(null); }} onApply={apply}
    loading={catalog.isLoading || products.isLoading} previewLoading={previewLoading || managementLoading} applyLoading={applyLoading}
    error={requestError instanceof Error ? requestError.message : requestError ? "Data belum dapat dimuat. Silakan coba lagi." : null}
    onRetry={() => { if (catalog.isError) void catalog.refetch(); if (products.isError) void products.refetch(); }}
    actionError={actionError} successMessage={successMessage}
  />
    {(canCreate || canUpdate || canDelete) && <ClassificationSubcategoryManager
      subcategories={catalog.data?.subcategories ?? []} canCreate={canCreate} canUpdate={canUpdate} canDelete={canDelete}
      disabled={previewLoading || applyLoading || managementLoading} onManage={manage} />}
  </>;
}
