"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CategoryCustomerPricingMode,
  PricingCustomerType,
} from "@/features/customer-category-pricing/helpers/pricing-rules";

export interface CustomerCategoryPricingRule {
  id: string;
  storeId: string;
  categoryId: string;
  customerType: PricingCustomerType;
  customerTypes?: PricingCustomerType[];
  unit: string | null;
  brandId: string | null;
  mode: CategoryCustomerPricingMode;
  value: number;
  discountPercent?: number;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
  };
  brand?: {
    id: string;
    name: string;
    normalizedName: string;
  } | null;
}

export interface CustomerCategoryPricingRuleInput {
  categoryId: string;
  customerType?: PricingCustomerType;
  customerTypes?: PricingCustomerType[];
  unit?: string | null;
  brandId?: string | null;
  mode: CategoryCustomerPricingMode;
  value: number;
  discountPercent?: number;
  isActive?: boolean;
}

export interface CustomerCategoryPricingRulesParams {
  activeOnly?: boolean;
  customerType?: PricingCustomerType;
  categoryId?: string;
  brandId?: string;
}

async function fetchRules(
  params: CustomerCategoryPricingRulesParams = {},
): Promise<CustomerCategoryPricingRule[]> {
  const sp = new URLSearchParams();
  if (params.activeOnly) sp.set("activeOnly", "true");
  if (params.customerType) sp.set("customerType", params.customerType);
  if (params.categoryId) sp.set("categoryId", params.categoryId);
  if (params.brandId) sp.set("brandId", params.brandId);

  const res = await fetch(`/api/customer-category-pricing-rules?${sp.toString()}`);
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.error ?? error?.message ?? "Aturan harga belum berhasil dimuat");
  }
  const json = (await res.json()) as { data: CustomerCategoryPricingRule[] };
  return json.data;
}

async function createRule(
  input: CustomerCategoryPricingRuleInput,
): Promise<CustomerCategoryPricingRule> {
  const res = await fetch("/api/customer-category-pricing-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json();
    throw Object.assign(new Error(error?.error ?? error?.message ?? "Aturan harga belum berhasil disimpan"), {
      status: res.status,
      data: error,
    });
  }
  return res.json();
}

async function updateRule(
  input: { id: string } & Partial<CustomerCategoryPricingRuleInput>,
): Promise<CustomerCategoryPricingRule> {
  const { id, ...body } = input;
  const res = await fetch(`/api/customer-category-pricing-rules/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json();
    throw Object.assign(new Error(error?.error ?? error?.message ?? "Aturan harga belum berhasil disimpan"), {
      status: res.status,
      data: error,
    });
  }
  return res.json();
}

async function deleteRule(id: string): Promise<void> {
  const res = await fetch(`/api/customer-category-pricing-rules/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error?.error ?? error?.message ?? "Aturan harga belum berhasil dinonaktifkan");
  }
}

export function useCustomerCategoryPricingRules(
  params: CustomerCategoryPricingRulesParams = {},
) {
  return useQuery({
    queryKey: ["customer-category-pricing-rules", params],
    queryFn: () => fetchRules(params),
    staleTime: 30_000,
  });
}

export function useCreateCustomerCategoryPricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-category-pricing-rules"] });
      qc.invalidateQueries({ queryKey: ["pricing-scope-units"] });
      qc.invalidateQueries({ queryKey: ["pricing-scope-options"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useUpdateCustomerCategoryPricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-category-pricing-rules"] });
      qc.invalidateQueries({ queryKey: ["pricing-scope-units"] });
      qc.invalidateQueries({ queryKey: ["pricing-scope-options"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useDeleteCustomerCategoryPricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-category-pricing-rules"] });
      qc.invalidateQueries({ queryKey: ["pricing-scope-units"] });
      qc.invalidateQueries({ queryKey: ["pricing-scope-options"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export interface PricingScopeOptions {
  units: string[];
  products: Array<{ id: string; name: string; unit: string; price: number; costPrice?: number | null; brandId: string | null; baseCostPrice: number | null; baseCostUnit: string | null }>;
}

async function fetchPricingScopeOptions(
  categoryId: string,
  view: "units" | "preview",
  signal: AbortSignal,
  unit?: string | null,
  brandId?: string | null,
): Promise<PricingScopeOptions> {
  const params = new URLSearchParams({ categoryId, view });
  if (unit) params.set("unit", unit);
  if (brandId) params.set("brandId", brandId);
  const response = await fetch(`/api/customer-category-pricing-rules/scope-options?${params}`, { signal });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message ?? (view === "units" ? "Satuan belum berhasil dimuat" : "Contoh harga belum berhasil dimuat"));
  }
  const json = await response.json() as { data: PricingScopeOptions };
  return json.data;
}

export function usePricingUnitOptions(categoryId?: string) {
  return useQuery({
    queryKey: ["pricing-scope-units", categoryId],
    enabled: Boolean(categoryId),
    queryFn: async ({ signal }) => (await fetchPricingScopeOptions(categoryId!, "units", signal)).units,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function usePricingScopeOptions(categoryId?: string, unit?: string | null, brandId?: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["pricing-scope-options", categoryId, unit, brandId],
    enabled: Boolean(categoryId) && options.enabled !== false,
    queryFn: ({ signal }) => fetchPricingScopeOptions(categoryId!, "preview", signal, unit, brandId),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
