"use client";

import type {
  InternalUseRecapPeriod,
  InternalUseRecapResponse,
} from "../types";

export interface InternalUseRecapParams {
  period: InternalUseRecapPeriod;
  date: string;
}

function buildSearchParams(params: InternalUseRecapParams): string {
  const searchParams = new URLSearchParams();
  searchParams.set("period", params.period);
  searchParams.set("date", params.date);
  return searchParams.toString();
}

export async function fetchInternalUseRecap(
  params: InternalUseRecapParams,
): Promise<InternalUseRecapResponse> {
  const response = await fetch(
    `/api/inventory/internal-use-recap?${buildSearchParams(params)}`,
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message || "Gagal memuat rekap pemakaian internal");
  }
  return response.json() as Promise<InternalUseRecapResponse>;
}

export async function downloadInternalUseRecapPdf(
  params: InternalUseRecapParams,
): Promise<void> {
  const response = await fetch(
    `/api/inventory/internal-use-recap/pdf?${buildSearchParams(params)}`,
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message || "Gagal mengunduh PDF rekap");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `rekap-pemakaian-internal-${params.period}-${params.date}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
