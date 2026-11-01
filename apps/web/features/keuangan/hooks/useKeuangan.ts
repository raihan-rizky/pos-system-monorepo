"use client";

import { useQuery } from "@tanstack/react-query";
import { useRole } from "@/components/providers/RoleProvider";
import type {
  ExpenseCategoryKey,
  CategoryBucket,
} from "@/features/keuangan/helpers/keuangan-core";
import type { CustomExpenseCategory } from "@/features/keuangan/helpers/category-meta";

export type IncomeSummary = {
  month: string;
  monthlyTotal: number;
  transactionCount: number;
  daily: { date: string; total: number; count: number }[];
  cashDaily?: { date: string; total: number }[];
  cashTotal?: number;
};

export type ExpenseSummary = {
  month: string;
  monthlyTotal: number;
  entryCount: number;
  byCategory: CategoryBucket[];
  daily: {
    date: string;
    total: number;
    byCategory: Partial<Record<ExpenseCategoryKey, number>>;
  }[];
  cashDaily?: { date: string; total: number }[];
  cashExpense?: { total: number | null; incomplete: boolean };
};

export type CashFlowSummary = {
  month: string;
  income: { total: number; daily: { date: string; total: number }[] };
  expense: { total: number | null; incomplete: boolean; daily: { date: string; total: number }[] };
};

export type ExpenseListItem = {
  id: string;
  applicantName: string;
  category: ExpenseCategoryKey;
  description: string | null;
  amount: number;
  changeAmount: number;
  netAmount: number;
  occurredAt: string;
  createdAt: string;
  transactionId: string | null;
  attachmentUrl: string | null;
  hasMissingCostSnapshot: boolean;
  source:
    | { type: "MANUAL" }
    | { type: "SHOPPING_REQUEST"; id: string; number: string }
    | { type: "BACKDATED_PURCHASE"; id: string; number: string }
    | { type: "GOODS_PURCHASE"; id: string; number: string };
  recordedBy: { id: string; name: string };
};

export type ExpenseListResponse = {
  data: ExpenseListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function useCashFlowSummary(month: string, enabled = true) {
  const { userId, storeId, authorizationFingerprint } = useRole();
  return useQuery({
    queryKey: ["finance", "cash-flow-summary", userId, storeId, authorizationFingerprint, month],
    queryFn: () => getJSON<CashFlowSummary>(`/api/finance/cash-flow/summary?month=${month}`),
    staleTime: 30_000,
    enabled,
  });
}

export function useIncomeSummary(month: string, enabled = true, metricsOnly = false) {
  const { userId, storeId, authorizationFingerprint } = useRole();
  return useQuery({
    queryKey: ["finance", "income-summary", userId, storeId, authorizationFingerprint, month, metricsOnly ? "metrics" : "full"],
    queryFn: () =>
      getJSON<IncomeSummary>(`/api/finance/income/summary?month=${month}${metricsOnly ? "&metricsOnly=1" : ""}`),
    staleTime: 60_000,
    enabled,
  });
}

export function useExpenseSummary(month: string, enabled = true, metricsOnly = false) {
  const { userId, storeId, authorizationFingerprint } = useRole();
  return useQuery({
    queryKey: ["finance", "expense-summary", userId, storeId, authorizationFingerprint, month, metricsOnly ? "metrics" : "full"],
    queryFn: () =>
      getJSON<ExpenseSummary>(`/api/finance/expenses/summary?month=${month}${metricsOnly ? "&metricsOnly=1" : ""}`),
    staleTime: 30_000,
    enabled,
  });
}

export function expenseCategoriesQueryKey(userId: string | null, storeId: string | null, authorizationFingerprint: string | null) {
  return ["finance", "expense-categories", userId, storeId, authorizationFingerprint] as const;
}

export function useCustomExpenseCategories(enabled = true) {
  const { userId, storeId, authorizationFingerprint } = useRole();
  return useQuery({
    queryKey: expenseCategoriesQueryKey(userId, storeId, authorizationFingerprint),
    queryFn: () => getJSON<{ data: CustomExpenseCategory[] }>("/api/finance/expense-categories"),
    staleTime: 30_000,
    enabled,
  });
}

export function useExpenseList(
  month: string,
  page: number,
  category?: ExpenseCategoryKey | null,
  enabled = true,
) {
  const { userId, storeId, authorizationFingerprint } = useRole();
  const params = new URLSearchParams({ month, page: String(page) });
  if (category) params.set("category", category);
  return useQuery({
    queryKey: ["finance", "expense-list", userId, storeId, authorizationFingerprint, month, page, category ?? "all"],
    queryFn: () =>
      getJSON<ExpenseListResponse>(
        `/api/finance/expenses?${params.toString()}`,
      ),
    staleTime: 15_000,
    enabled,
  });
}
