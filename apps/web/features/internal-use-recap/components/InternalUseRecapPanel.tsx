"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Download,
  FileText,
  PackageMinus,
  RefreshCw,
} from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import { downloadInternalUseRecapPdf } from "../api/internal-use-recap-api";
import { todayJakartaIsoDate } from "../helpers/period";
import { useInternalUseRecap } from "../hooks/useInternalUseRecap";
import type { InternalUseRecapPeriod } from "../types";

const PERIOD_OPTIONS: Array<{ id: InternalUseRecapPeriod; label: string }> = [
  { id: "daily", label: "Harian" },
  { id: "weekly", label: "Mingguan" },
  { id: "monthly", label: "Bulanan" },
];

function formatQty(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function InternalUseRecapPanel() {
  const [period, setPeriod] = useState<InternalUseRecapPeriod>("weekly");
  const [date, setDate] = useState(() => todayJakartaIsoDate());
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const { data, isLoading, isError, refetch } = useInternalUseRecap({ period, date });
  const recap = data?.data;
  const topProducts = useMemo(() => recap?.products.slice(0, 5) ?? [], [recap]);

  const handleDownload = useCallback(async () => {
    setDownloadError(null);
    setIsDownloading(true);
    try {
      await downloadInternalUseRecapPdf({ period, date });
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Gagal mengunduh PDF rekap",
      );
    } finally {
      setIsDownloading(false);
    }
  }, [date, period]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PackageMinus className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-black text-slate-900">
              Rekap Pemakaian Internal
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {recap?.range.label ?? "Log OUT dengan alasan Pemakaian Internal"}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div
            role="tablist"
            aria-label="Periode rekap pemakaian internal"
            className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1"
          >
            {PERIOD_OPTIONS.map((option) => {
              const active = period === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPeriod(option.id)}
                  className={`min-h-8 rounded-lg px-3 text-xs font-bold transition-colors ${
                    active
                      ? "bg-white text-amber-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <label className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none"
              aria-label="Tanggal acuan rekap"
            />
          </label>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-200"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Muat
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading || isLoading || !recap}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            PDF
          </button>
        </div>
      </div>

      {isError && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Gagal memuat rekap pemakaian internal.</span>
        </div>
      )}
      {downloadError && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{downloadError}</span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric label="Entri" value={isLoading ? "..." : String(recap?.summary.entryCount ?? 0)} />
        <Metric label="Produk" value={isLoading ? "..." : String(recap?.summary.productCount ?? 0)} />
        <Metric label="Total qty" value={isLoading ? "..." : formatQty(recap?.summary.totalQuantity ?? 0)} />
        <Metric
          label="Nilai"
          value={isLoading ? "..." : formatRupiah(recap?.summary.totalValue ?? 0)}
          muted={recap?.summary.hasIncompleteValue}
        />
      </div>

      {recap?.summary.hasIncompleteValue && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {recap.summary.missingUnitCostCount} entri tidak punya HPP, jadi nilai
            rekap belum lengkap.
          </span>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
          <FileText className="h-4 w-4" />
          Produk Terpakai
        </div>
        {topProducts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-xs font-semibold text-slate-400">
            Tidak ada pemakaian internal pada periode ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="py-2 pr-3">Produk</th>
                  <th className="py-2 px-3 text-right">Qty</th>
                  <th className="py-2 px-3">Unit</th>
                  <th className="py-2 pl-3 text-right">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((product) => (
                  <tr key={`${product.productId}:${product.unit}`} className="border-b border-slate-50">
                    <td className="py-2 pr-3">
                      <p className="text-xs font-bold text-slate-900">{product.name}</p>
                      <p className="text-[10px] font-bold text-slate-400">{product.sku}</p>
                    </td>
                    <td className="py-2 px-3 text-right text-xs font-black tabular-nums text-slate-700">
                      {formatQty(product.quantity)}
                    </td>
                    <td className="py-2 px-3 text-xs font-semibold text-slate-500">
                      {product.unit}
                    </td>
                    <td className="py-2 pl-3 text-right text-xs font-black tabular-nums text-slate-900">
                      {formatRupiah(product.value)}
                      {product.missingUnitCostCount > 0 && (
                        <span className="ml-1 text-amber-600">*</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-sm font-black tabular-nums ${
          muted ? "text-amber-700" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
