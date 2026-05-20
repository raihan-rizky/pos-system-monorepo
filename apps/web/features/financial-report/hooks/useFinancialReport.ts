"use client";

import { useQuery } from "@tanstack/react-query";
import type { FinancialReport } from "../helpers/report-core";

export type FinancialReportParams = {
  dateFrom: string;
  dateTo: string;
};

async function fetchFinancialReport(params: FinancialReportParams) {
  const searchParams = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const response = await fetch(`/api/finance/report?${searchParams}`);
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(error?.message || "Failed to load financial report");
  }

  return response.json() as Promise<FinancialReport>;
}

export function useFinancialReport(params: FinancialReportParams) {
  return useQuery({
    queryKey: ["financial-report", params],
    queryFn: () => fetchFinancialReport(params),
    placeholderData: (previous) => previous,
  });
}
