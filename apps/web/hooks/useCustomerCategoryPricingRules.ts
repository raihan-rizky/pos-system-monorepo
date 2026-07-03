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
  unit: string | null;
  brandId: string | null;
  mode: CategoryCustomerPricingMode;
  value: number;
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
  customerType: PricingCustomerType;
  unit?: string | null;
  brandId?: string | null;
  mode: CategoryCustomerPricingMode;
  value: number;
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
    throw new Error(error?.error ?? error?.message ?? "Failed to fetch pricing rules");
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
    throw Object.assign(new Error(error?.error ?? error?.message ?? "Failed to create pricing rule"), {
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
    throw Object.assign(new Error(error?.error ?? error?.message ?? "Failed to update pricing rule"), {
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
    throw new Error(error?.error ?? error?.message ?? "Failed to delete pricing rule");
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
    },
  });
}

export function useUpdateCustomerCategoryPricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-category-pricing-rules"] });
    },
  });
}

export function useDeleteCustomerCategoryPricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-category-pricing-rules"] });
    },
  });
}
