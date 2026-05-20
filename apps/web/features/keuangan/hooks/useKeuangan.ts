"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  ExpenseCategory,
  CategoryBucket,
} from "@/features/keuangan/helpers/keuangan-core";

export type IncomeSummary = {
  month: string;
  monthlyTotal: number;
  transactionCount: number;
  daily: { date: string; total: number; count: number }[];
};

export type ExpenseSummary = {
  month: string;
  monthlyTotal: number;
  entryCount: number;
  byCategory: CategoryBucket[];
  daily: {
    date: string;
    total: number;
    byCategory: Partial<Record<ExpenseCategory, number>>;
  }[];
  netCashFlow: { income: number; expense: number; net: number };
};

export type ExpenseListItem = {
  id: string;
  applicantName: string;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  changeAmount: number;
  netAmount: number;
  occurredAt: string;
  createdAt: string;
  transactionId: string | null;
  attachmentUrl: string | null;
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

export function useIncomeSummary(month: string) {
  return useQuery({
    queryKey: ["finance", "income-summary", month],
    queryFn: () =>
      getJSON<IncomeSummary>(`/api/finance/income/summary?month=${month}`),
    staleTime: 60_000,
  });
}

export function useExpenseSummary(month: string) {
  return useQuery({
    queryKey: ["finance", "expense-summary", month],
    queryFn: () =>
      getJSON<ExpenseSummary>(`/api/finance/expenses/summary?month=${month}`),
    staleTime: 30_000,
  });
}

export function useExpenseList(
  month: string,
  page: number,
  category?: ExpenseCategory | null,
) {
  const params = new URLSearchParams({ month, page: String(page) });
  if (category) params.set("category", category);
  return useQuery({
    queryKey: ["finance", "expense-list", month, page, category ?? "all"],
    queryFn: () =>
      getJSON<ExpenseListResponse>(
        `/api/finance/expenses?${params.toString()}`,
      ),
    staleTime: 15_000,
  });
}
