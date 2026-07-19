"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { buildCustomerRecapRange } from "../helpers/recap-core";
import type { CustomerRecapPreset } from "../helpers/recap-core";
import type { CustomerRecapQuery } from "../types/customer-recap";
import { exportCustomerRecapRange } from "../helpers/customer-recap-export-client";

type ExportFormat = "xlsx" | "pdf";
type ExportStep = "closed" | "period" | "format";

const PERIOD_OPTIONS: Array<{
  value: Extract<CustomerRecapPreset, "daily" | "weekly" | "monthly" | "30d" | "yearly">;
  label: string;
  hint: string;
}> = [
  { value: "daily", label: "Harian", hint: "Hari ini" },
  { value: "weekly", label: "Mingguan", hint: "Senin sampai hari ini" },
  { value: "30d", label: "30 Hari", hint: "30 hari terakhir" },
  { value: "monthly", label: "Bulanan", hint: "Bulan berjalan" },
  { value: "yearly", label: "Tahunan", hint: "Tahun berjalan" },
];

const FORMAT_OPTIONS: Array<{
  value: ExportFormat;
  label: string;
  hint: string;
  icon: typeof FileSpreadsheet;
}> = [
  { value: "xlsx", label: "Excel (.xlsx)", hint: "Sheet per tipe pelanggan", icon: FileSpreadsheet },
  { value: "pdf", label: "PDF", hint: "Siap dicetak atau dibagikan", icon: FileText },
];

interface CustomerRecapExportMenuProps {
  range: CustomerRecapQuery;
  onRangeChange: (next: CustomerRecapQuery) => void;
}

export function CustomerRecapExportMenu({
  range,
  onRangeChange,
}: CustomerRecapExportMenuProps) {
  const [step, setStep] = useState<ExportStep>("closed");
  const [selectedRange, setSelectedRange] = useState<CustomerRecapQuery>(range);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedFormat, setFailedFormat] = useState<ExportFormat | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (step === "closed") return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setStep("closed");
        setError(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setStep("closed");
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [busy, step]);

  const close = useCallback(() => {
    if (busy) return;
    setStep("closed");
    setError(null);
  }, [busy]);

  const handlePeriod = useCallback(
    (preset: Extract<CustomerRecapPreset, "daily" | "weekly" | "monthly" | "30d" | "yearly">) => {
      const nextRange = buildCustomerRecapRange(preset);
      setSelectedRange(nextRange);
      onRangeChange(nextRange);
      setError(null);
      setFailedFormat(null);
      setStep("format");
    },
    [onRangeChange],
  );

  const handleFormat = useCallback(
    async (format: ExportFormat) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setFailedFormat(null);
      try {
        await exportCustomerRecapRange(selectedRange, format);
        setStep("closed");
      } catch (err) {
        setFailedFormat(format);
        setError(
          err instanceof Error ? err.message : "Gagal mengekspor rekap pelanggan",
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, selectedRange],
  );

  const isOpen = step !== "closed";

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setFailedFormat(null);
          setSelectedRange(range);
          setStep((current) => (current === "closed" ? "period" : "closed"));
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Ekspor
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {step === "period" ? (
            <>
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  1. Pilih periode
                </p>
              </div>
              <div className="p-1">
                {PERIOD_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitem"
                    onClick={() => handlePeriod(option.value)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50"
                  >
                    <span>
                      <span className="block text-sm font-bold text-slate-900">{option.label}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{option.hint}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setStep("period")}
                  disabled={busy}
                  aria-label="Kembali pilih periode"
                  className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  2. Pilih format
                </p>
              </div>
              <div className="p-1">
                {FORMAT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitem"
                      disabled={busy}
                      onClick={() => void handleFormat(option.value)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-slate-900">{option.label}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-500">{option.hint}</span>
                      </span>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
              {busy ? (
                <div className="border-t border-slate-100 px-4 py-2.5 text-[11px] font-semibold text-slate-500">
                  Menyiapkan data, analisis AI, dan file...
                </div>
              ) : null}
              {error ? (
                <div className="flex items-center justify-between gap-3 border-t border-red-100 bg-red-50 px-4 py-2.5 text-[11px] text-red-700">
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (failedFormat) void handleFormat(failedFormat);
                    }}
                    className="shrink-0 font-bold underline"
                  >
                    Coba lagi
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default CustomerRecapExportMenu;
