"use client";

import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { Button } from "@pos/ui";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import {
  exportFinancialReportFile,
  type ReportExportFormat,
} from "@/features/financial-report/helpers/journal-export";
import type { ReportPeriod } from "@/features/financial-report/helpers/journal-core";

type ExportFormat = ReportExportFormat;
type Step = "closed" | "format" | "period";

const FORMAT_OPTIONS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: "xlsx", label: "Excel (.xlsx)", hint: "Tabel angka, bisa diolah ulang" },
  { value: "pdf", label: "PDF", hint: "Siap cetak / dibagikan" },
];

const PERIOD_OPTIONS: { value: ReportPeriod; label: string; hint: string }[] = [
  { value: "daily", label: "Harian", hint: "Hari ini" },
  { value: "weekly", label: "Mingguan", hint: "7 hari terakhir" },
  { value: "30d", label: "30 Hari", hint: "30 hari terakhir" },
  { value: "monthly", label: "Bulanan", hint: "Bulan berjalan" },
];

const DownloadIcon = (
  <Download className="h-4 w-4" aria-hidden="true" />
);

const BackIcon = (
  <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
);

export function ReportExportMenu(): ReactNode {
  const [step, setStep] = useState<Step>("closed");
  const [format, setFormat] = useState<ExportFormat | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setStep("closed");
    setFormat(null);
    setError(null);
  }, []);

  // Click-outside dismiss
  useEffect(() => {
    if (step === "closed") return;
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [step, close]);

  const handlePeriod = useCallback(
    async (period: ReportPeriod) => {
      if (!format || busy) return;
      setBusy(true);
      setError(null);
      try {
        await exportFinancialReportFile(period, format);
        close();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal mengekspor");
      } finally {
        setBusy(false);
      }
    },
    [format, busy, close],
  );

  const open = step !== "closed";

  return (
    <div ref={containerRef} className="relative inline-block">
      <Button
        type="button"
        variant="secondary"
        icon={DownloadIcon}
        onClick={() => setStep((s) => (s === "closed" ? "format" : "closed"))}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Ekspor
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 z-30 rounded-xl border border-surface-200 bg-white shadow-xl overflow-hidden"
        >
          {step === "format" && (
            <>
              <div className="px-4 py-3 border-b border-surface-100">
                <p className="text-[11px] font-bold uppercase tracking-wider text-surface-500">
                  Pilih format
                </p>
              </div>
              <ul className="py-1">
                {FORMAT_OPTIONS.map((opt) => (
                  <li key={opt.value}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setFormat(opt.value);
                        setStep("period");
                      }}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-50 cursor-pointer transition-colors focus:outline-none focus:bg-surface-50"
                    >
                      <div>
                        <p className="text-sm font-semibold text-surface-900">{opt.label}</p>
                        <p className="text-[11px] text-surface-500">{opt.hint}</p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-surface-400" strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {step === "period" && (
            <>
              <div className="px-4 py-3 border-b border-surface-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep("format");
                    setFormat(null);
                    setError(null);
                  }}
                  className="p-1 -ml-1 rounded-md text-surface-500 hover:text-surface-900 hover:bg-surface-100 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  aria-label="Kembali"
                >
                  {BackIcon}
                </button>
                <p className="text-[11px] font-bold uppercase tracking-wider text-surface-500">
                  {format === "xlsx" ? "Excel · Pilih periode" : "PDF · Pilih periode"}
                </p>
              </div>
              <ul className="py-1">
                {PERIOD_OPTIONS.map((opt) => (
                  <li key={opt.value}>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={busy}
                      onClick={() => void handlePeriod(opt.value)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:bg-surface-50"
                    >
                      <div>
                        <p className="text-sm font-semibold text-surface-900">{opt.label}</p>
                        <p className="text-[11px] text-surface-500">{opt.hint}</p>
                      </div>
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin text-surface-500" aria-hidden="true" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
              {error && (
                <div className="px-4 py-2.5 border-t border-surface-100 bg-red-50 text-[11px] text-red-700">
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
