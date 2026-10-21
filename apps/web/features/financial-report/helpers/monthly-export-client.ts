"use client";

import type { MonthlyFinancialReport } from "./monthly-report-types";

export async function exportMonthlyFinancialReport(year: number, month: number): Promise<void> {
  const response = await fetch(`/api/finance/report/monthly?year=${year}&month=${month}`, { cache: "no-store" }).catch(() => {
    throw new Error("Koneksi terputus. Periksa internet Anda lalu coba lagi.");
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(error?.message || "Laporan belum bisa diunduh. Silakan coba lagi.");
  }
  const report = await response.json() as MonthlyFinancialReport;
  const { serializeMonthlyWorkbook } = await import("./monthly-workbook");
  const bytes = serializeMonthlyWorkbook(report);
  const blob = new Blob([new Uint8Array(bytes).buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = `laporan-keuangan-${year}-${String(month).padStart(2, "0")}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
