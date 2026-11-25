"use client";

import { useQuery } from "@tanstack/react-query";
import type { FinancialReportResponse } from "../helpers/report-breakdowns";

export type FinancialReportParams = {
  dateFrom: string;
  dateTo: string;
  view?: "sales";
  summaryCatalog?: boolean;
};

export async function fetchFinancialReport(params: FinancialReportParams) {
  const searchParams = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  if (params.view === "sales") searchParams.set("view", "sales");
  if (params.summaryCatalog) searchParams.set("summaryCatalog", "1");

  const response = await fetch(`/api/finance/report?${searchParams}`);
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(error?.message || "Gagal memuat laporan keuangan");
  }

  return response.json() as Promise<FinancialReportResponse>;
}

export function useFinancialReport(params: FinancialReportParams) {
  return useQuery({
    queryKey: ["financial-report", params],
    queryFn: () => fetchFinancialReport(params),
    placeholderData: (previous, previousQuery) => {
      const previousParams = previousQuery?.queryKey[1] as FinancialReportParams | undefined;
      return previousParams?.view === params.view && previousParams?.summaryCatalog === params.summaryCatalog ? previous : undefined;
    },
  });
}
