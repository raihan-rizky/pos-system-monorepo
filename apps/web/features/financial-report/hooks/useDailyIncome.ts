"use client";

import { useQuery } from "@tanstack/react-query";
import { useRole } from "@/components/providers/RoleProvider";
import type { DailyIncomeAccess, DailyIncomeResponse } from "../helpers/daily-income";

export function useDailyIncome(date: string, access: DailyIncomeAccess, previewSales = false) {
  const { userId, storeId, authorizationFingerprint } = useRole();
  return useQuery({
    queryKey: ["daily-financial-report", userId, storeId, authorizationFingerprint, date, access, previewSales],
    enabled: Boolean(date && Object.values(access).some(Boolean)),
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ date });
      if (previewSales) params.set("view", "sales");
      const response = await fetch(`/api/finance/report/daily?${params}`, { signal, cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Pemasukan harian belum dapat dimuat.");
      }
      return response.json() as Promise<DailyIncomeResponse>;
    },
  });
}
