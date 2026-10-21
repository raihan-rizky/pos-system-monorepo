"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@pos/ui";
import { Download, FileSpreadsheet, X } from "lucide-react";
import { exportFinancialReportFile, type ReportExportFormat } from "../helpers/journal-export";
import { exportMonthlyFinancialReport } from "../helpers/monthly-export-client";
import type { ReportPeriod } from "../helpers/journal-core";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: "daily", label: "Harian · Hari ini" },
  { value: "weekly", label: "Mingguan · 7 hari terakhir" },
  { value: "30d", label: "30 hari terakhir" },
  { value: "monthly", label: "Bulanan · Bulan berjalan" },
];
const controlClass = "mt-1.5 w-full rounded-lg border border-surface-300 bg-white px-3 py-2.5 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-100";

export function ReportExportMenu(): ReactNode {
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const firstControlRef = useRef<HTMLSelectElement>(null);
  const submittingRef = useRef(false);
  const [today] = useState(() => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
    const part = (name: string) => Number(parts.find(item => item.type === name)?.value);
    return { year: part("year"), month: part("month"), day: part("day") };
  });
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"monthly" | "journal">("monthly");
  const [format, setFormat] = useState<ReportExportFormat>("xlsx");
  const [month, setMonth] = useState(today.month);
  const [year, setYear] = useState(String(today.year));
  const [period, setPeriod] = useState<ReportPeriod>("monthly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedYear = Number(year);
  const validPeriod = Number.isInteger(selectedYear) && selectedYear >= 1900 && selectedYear <= today.year && (selectedYear < today.year || month <= today.month);
  const endDay = selectedYear === today.year && month === today.month ? today.day : new Date(Date.UTC(selectedYear, month, 0)).getUTCDate();
  const monthName = MONTHS[month - 1];
  const sheetMonth = monthName.toLocaleUpperCase("id-ID");
  // Keep the preview independent of the XLSX package; load the builder only on download.
  const sheets = ["LAP KEU", "BERSIH", sheetMonth, `RC ${sheetMonth}`, `RP ${sheetMonth}`, "PENGELUARAN BELANJA", "PIUTANG & HUTANG"];

  function openDialog() {
    setMode("monthly");
    setFormat("xlsx");
    setError(null);
    dialogRef.current?.showModal();
    setOpen(true);
    firstControlRef.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || (mode === "monthly" && !validPeriod)) return;
    submittingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (mode === "monthly") await exportMonthlyFinancialReport(selectedYear, month);
      else await exportFinancialReportFile(period, format);
      dialogRef.current?.close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Laporan belum bisa diunduh. Silakan coba lagi.");
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  const downloadFormat = mode === "monthly" || format === "xlsx" ? "Excel" : "PDF";

  return (
    <div ref={triggerRef} className="inline-block">
      <Button type="button" variant="secondary" icon={<Download className="h-4 w-4" aria-hidden="true" />} onClick={openDialog} aria-haspopup="dialog" aria-expanded={open}>
        Ekspor
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-surface-200 bg-white p-0 text-surface-900 shadow-2xl backdrop:bg-surface-950/45 open:flex open:flex-col"
        onKeyDown={event => {
          if (event.key !== "Tab") return;
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), input:not(:disabled)"));
          if (!controls.length) { event.preventDefault(); return; }
          const current = controls.indexOf(document.activeElement as HTMLElement);
          const next = (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
          event.preventDefault();
          controls[next].focus();
        }}
        onCancel={event => { if (submittingRef.current) event.preventDefault(); }}
        onClose={() => { setOpen(false); triggerRef.current?.querySelector("button")?.focus(); }}
      >
        <form onSubmit={event => void submit(event)} aria-busy={busy} className="flex min-h-0 flex-col">
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-surface-200 px-5 py-4 sm:px-6">
            <div>
              <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">Ekspor laporan keuangan</h2>
              <p id={`${id}-description`} className="mt-1 text-sm text-surface-600">Pilih laporan dan periode yang ingin diunduh.</p>
            </div>
            <button type="button" aria-label="Tutup" disabled={busy} onClick={() => dialogRef.current?.close()} className="-mr-2 -mt-1 rounded-lg p-2.5 text-surface-500 hover:bg-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-40">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </header>
          <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
            <fieldset disabled={busy} className="min-w-0 space-y-5">
              <div>
                <label htmlFor={`${id}-mode`} className="text-sm font-medium">Jenis laporan</label>
                <select ref={firstControlRef} id={`${id}-mode`} value={mode} onChange={event => { setMode(event.target.value as "monthly" | "journal"); setError(null); }} className={controlClass}>
                  <option value="monthly">Laporan bulanan · Excel 7 sheet</option>
                  <option value="journal">Jurnal transaksi · Excel / PDF</option>
                </select>
              </div>
              {mode === "monthly" ? (
                <>
                  <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                    <div>
                      <label htmlFor={`${id}-month`} className="text-sm font-medium">Bulan</label>
                      <select id={`${id}-month`} value={month} onChange={event => { setMonth(Number(event.target.value)); setError(null); }} className={controlClass}>
                        {MONTHS.map((name, index) => <option key={name} value={index + 1} disabled={selectedYear === today.year && index + 1 > today.month}>{name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`${id}-year`} className="text-sm font-medium">Tahun</label>
                      <input id={`${id}-year`} type="number" min={1900} max={today.year} required value={year} onChange={event => { const value = event.target.value; setYear(value); if (Number(value) === today.year && month > today.month) setMonth(today.month); setError(null); }} className={controlClass} />
                    </div>
                  </div>
                  <section aria-label="Isi laporan bulanan" className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                    <div className="flex items-start gap-2.5">
                      <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
                      <div>
                        <h3 className="text-sm font-semibold">7 sheet dalam satu Excel</h3>
                        <p className="mt-1 text-sm text-surface-600">{validPeriod ? `1–${endDay} ${monthName} ${year}` : "Pilih bulan dan tahun yang valid"}</p>
                      </div>
                    </div>
                    <ol aria-label="Tujuh sheet Excel" className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs text-surface-700 sm:grid-cols-2">
                      {sheets.map((sheet, index) => <li key={sheet} className="flex gap-2"><span className="w-3 shrink-0 tabular-nums text-surface-500">{index + 1}.</span><span>{sheet}</span></li>)}
                    </ol>
                  </section>
                  <div className="space-y-2 text-xs leading-relaxed text-surface-600">
                    <p className="font-medium text-surface-800">Modal awal diisi sendiri di Excel.</p>
                    <p>Persediaan akhir dan hutang pemasok belum tersedia dari sistem. Sel terkait dibiarkan kosong.</p>
                    <p>Penerimaan dan pengeluaran memakai basis kas. Data bulan berjalan sampai hari ini (WIB).</p>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${id}-format`} className="text-sm font-medium">Format</label>
                    <select id={`${id}-format`} value={format} onChange={event => { setFormat(event.target.value as ReportExportFormat); setError(null); }} className={controlClass}>
                      <option value="xlsx">Excel (.xlsx)</option><option value="pdf">PDF</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${id}-period`} className="text-sm font-medium">Periode jurnal</label>
                    <select id={`${id}-period`} value={period} onChange={event => { setPeriod(event.target.value as ReportPeriod); setError(null); }} className={controlClass}>
                      {PERIODS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <p className="text-xs leading-relaxed text-surface-600 sm:col-span-2">Rincian transaksi dengan periode relatif sampai hari ini, dalam format Excel atau PDF.</p>
                </div>
              )}
            </fieldset>
          </div>
          <footer className="shrink-0 border-t border-surface-200 bg-white px-5 py-4 sm:px-6">
            {error && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
            <p role="status" aria-live="polite" className="mb-2 text-xs text-surface-600">{busy ? `Menyiapkan ${downloadFormat}… Mohon tunggu.` : "File akan tersimpan di folder unduhan Anda."}</p>
            <Button type="submit" loading={busy} disabled={mode === "monthly" && !validPeriod} icon={<Download className="h-4 w-4" aria-hidden="true" />} className="w-full">
              {busy ? `Menyiapkan ${downloadFormat}…` : error ? "Coba lagi" : `Unduh ${downloadFormat}`}
            </Button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
