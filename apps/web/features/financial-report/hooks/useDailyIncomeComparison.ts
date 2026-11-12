"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRole } from "@/components/providers/RoleProvider";
import type { ComparisonAmount } from "../helpers/daily-comparison";

export type SavedDailyIncomeComparison = {
  date: string;
  revision: number;
  amounts: ComparisonAmount[];
  posAtSave: Array<{ method: string; amount: string }>;
  savedAt: string;
  savedBy: string;
};

export class ComparisonRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ComparisonRequestError(body?.message || "Pemeriksaan penerimaan belum tersedia.", response.status);
  return body as T;
}

export function useDailyIncomeComparison(date: string, previewSales: boolean, enabled: boolean) {
  const { userId, storeId, authorizationFingerprint } = useRole();
  const query = useQuery({
    queryKey: ["daily-income-comparison", userId, storeId, authorizationFingerprint, date, previewSales],
    enabled, retry: false, gcTime: 0,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ date });
      if (previewSales) params.set("view", "sales");
      return responseJson<{ comparison: SavedDailyIncomeComparison | null }>(await fetch(`/api/finance/report/daily-comparison?${params}`, { signal, cache: "no-store" }));
    },
  });
  const save = useMutation({
    mutationFn: async (input: { date: string; revision: number | null; amounts: ComparisonAmount[] }) =>
      responseJson<{ comparison: SavedDailyIncomeComparison }>(await fetch("/api/finance/report/daily-comparison", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })),
  });
  return { query, save };
}
