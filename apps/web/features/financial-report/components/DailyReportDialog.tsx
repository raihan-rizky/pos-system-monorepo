"use client";

import { useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@pos/ui";
import { Download, FileText, Printer, X } from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import { formatRupiahPrecise } from "@/lib/utils";
import { jakartaToday } from "../helpers/daily-income";
import type { DailyReportDocument } from "../helpers/daily-report-document";
import { REPORT_HEADER } from "../helpers/journal-core";
import type { ReportPdfPageMode } from "../helpers/journal-export";

type ExportAction = "print" | "download";

function DailyReportActions({ action, onExport }: {
  action?: ExportAction | null;
  onExport?: (action: ExportAction) => void;
}) {
  const disabled = !onExport || Boolean(action);

  return (
    <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-surface-200 px-4 py-3 sm:px-6">
      <Button type="button" variant="secondary" icon={<Printer size={16} aria-hidden="true" />} disabled={disabled} loading={action === "print"} onClick={() => onExport?.("print")}>
        Cetak A4
      </Button>
      <Button type="button" icon={<Download size={16} aria-hidden="true" />} disabled={disabled} loading={action === "download"} onClick={() => onExport?.("download")}>
        Unduh PDF
      </Button>
    </footer>
  );
}

function DailyReportPreview({ report, pageMode }: { report: DailyReportDocument; pageMode: ReportPdfPageMode }) {
  const { footer, rows, details } = report.journal;
  const totals = [
    { label: "Total Pemasukan", value: footer.totalPemasukan, color: "border-emerald-100 bg-emerald-50 text-emerald-800" },
    { label: "Total Pengeluaran", value: footer.totalPengeluaran, color: "border-red-100 bg-red-50 text-red-800" },
    { label: "Grand Total", value: footer.grandTotal, color: "border-surface-200 bg-surface-100 text-surface-900" },
  ];
  const showJournal = pageMode === "multiple";
  const showExpenseTotals = details.showExpenseTotals !== false;

  return (
    <article aria-label="Pratinjau laporan harian" className="overflow-hidden rounded-xl border border-surface-200 bg-white">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-surface-900 px-4 py-3 text-white">
        <h3 className="text-base font-semibold">{showJournal ? "Jurnal Transaksi" : "Ringkasan Harian"}</h3>
        <p className="text-xs text-surface-200">{report.dateLabel}</p>
      </header>
      <div className="space-y-4 p-3 sm:p-4">
        <dl className={"grid gap-2 " + (showExpenseTotals ? "sm:grid-cols-3" : "sm:max-w-sm")}>
          {(showExpenseTotals ? totals : totals.slice(0, 1)).map(total => (
            <div key={total.label} className={"rounded-lg border px-3 py-2.5 " + total.color}>
              <dt className="text-xs font-medium">{total.label}</dt>
              <dd className="mt-0.5 break-words text-base font-semibold tabular-nums">{formatRupiahPrecise(total.value)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs leading-relaxed text-surface-600">{details.note}</p>
        {showJournal && (
          <div role="region" aria-label="Rincian jurnal transaksi" tabIndex={0} className="overflow-x-auto rounded-lg border border-surface-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
            <table aria-label="Jurnal Transaksi" className="w-full min-w-[52rem] border-collapse text-left text-xs">
              <thead className="bg-surface-900 text-white">
                <tr>{REPORT_HEADER.map(heading => <th key={heading} scope="col" className="whitespace-nowrap px-2.5 py-2 font-semibold">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {rows.map((row, index) => (
                  <tr key={row.invoice + "-" + index} className="even:bg-surface-50 [&>td]:px-2.5 [&>td]:py-2 [&>td]:align-top">
                    <td className="whitespace-nowrap tabular-nums">{row.tanggal}</td>
                    <td>{row.invoice}</td>
                    <td>{row.person}</td>
                    <td className="min-w-[12rem]">{row.products}</td>
                    <td>{row.categories}</td>
                    <td className={row.status === "Pemasukan" ? "font-semibold text-emerald-800" : "font-semibold text-red-800"}>{row.status}</td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">{formatRupiahPrecise(row.amount)}</td>
                    <td>{row.method}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={REPORT_HEADER.length} className="px-3 py-4 text-surface-600">Belum ada transaksi.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="grid items-start gap-4 sm:grid-cols-2">
          {details.tables.map(section => (
            <section key={section.title} className="min-w-0">
              <h3 className="mb-1.5 text-sm font-semibold text-surface-900">{section.title}</h3>
              <table aria-label={section.title} className="w-full table-fixed text-sm">
                <thead className="bg-surface-100 text-xs text-surface-600">
                  <tr>
                    <th scope="col" className="px-2 py-1.5 text-left font-semibold">{section.headers[0]}</th>
                    <th scope="col" className="w-[38%] px-2 py-1.5 text-right font-semibold">{section.headers[1]}</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.length ? section.rows.map(([label, amount]) => (
                    <tr key={label} className="border-b border-surface-100">
                      <th scope="row" className="break-words px-2 py-1.5 text-left font-medium">{label}</th>
                      <td className="break-words px-2 py-1.5 text-right font-semibold tabular-nums">{amount}</td>
                    </tr>
                  )) : <tr><td colSpan={2} className="px-2 py-2 text-surface-500">Belum ada data.</td></tr>}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}

function DailyReportResults({ date, pageMode }: { date: string; pageMode: ReportPdfPageMode }) {
  const { userId, storeId, authorizationFingerprint } = useRole();
  const query = useQuery({
    queryKey: ["daily-report-document", userId, storeId, authorizationFingerprint, date, pageMode],
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ date, layout: pageMode });
      const response = await fetch("/api/finance/report/daily-document?" + params, { cache: "no-store", signal });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Laporan Harian belum bisa dimuat.");
      }
      return response.json() as Promise<DailyReportDocument>;
    },
  });
  const [action, setAction] = useState<ExportAction | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const report = query.error ? undefined : query.data;

  async function exportReport(nextAction: ExportAction) {
    if (!report || action) return;
    setExportError(null);

    const printWindow = nextAction === "print" ? window.open("", "_blank") : null;
    if (nextAction === "print" && !printWindow) {
      setExportError("Izinkan pop-up di browser, lalu klik Cetak A4 lagi.");
      return;
    }

    setAction(nextAction);
    try {
      if (printWindow) {
        printWindow.opener = null;
        printWindow.document.title = "Menyiapkan laporan harian";
      }
      const { createReportPdf } = await import("../helpers/journal-export");
      const pdf = await createReportPdf(report.journal, pageMode, formatRupiahPrecise);
      if (printWindow) {
        if (printWindow.closed) throw new Error("Jendela cetak tertutup. Klik Cetak A4 untuk membukanya lagi.");
        pdf.autoPrint();
        const url = URL.createObjectURL(pdf.output("blob"));
        window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
        printWindow.location.href = url;
      } else {
        pdf.save("laporan-harian-" + date + ".pdf");
      }
    } catch (error) {
      printWindow?.close();
      setExportError(error instanceof Error ? error.message : "Laporan belum dapat disiapkan. Silakan coba lagi.");
    } finally {
      setAction(null);
    }
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface-50 px-4 py-3 sm:px-6">
        {report ? <DailyReportPreview report={report} pageMode={pageMode} /> : !query.error && query.isPending ? (
          <p role="status" className="py-4 text-sm text-surface-600">Memuat laporan harian…</p>
        ) : (
          <div className="space-y-3 py-4 text-sm">
            <p role="alert" className="text-red-700">{query.error?.message ?? "Laporan untuk tanggal ini belum tersedia."}</p>
            <Button type="button" size="sm" variant="secondary" loading={query.isFetching} onClick={() => void query.refetch()}>
              Coba lagi
            </Button>
          </div>
        )}
      </div>
      {exportError && <p role="alert" className="px-4 py-2 text-sm text-red-700 sm:px-6">{exportError}</p>}
      <DailyReportActions action={action} onExport={report ? (nextAction) => void exportReport(nextAction) : undefined} />
    </>
  );
}

export function DailyReportDialog({ dateFrom, dateTo, openedAsOwner = false }: {
  dateFrom: string;
  dateTo: string;
  openedAsOwner?: boolean;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState<string | null>(null);
  const [pageMode, setPageMode] = useState<ReportPdfPageMode>("multiple");
  const today = jakartaToday();
  const valid = date !== null && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;

  function openReport() {
    const currentDay = jakartaToday();
    const startsOnSingleDay = dateFrom && dateFrom === dateTo && dateFrom <= currentDay;
    setDate(startsOnSingleDay ? dateFrom : currentDay);
    setPageMode("multiple");
    dialogRef.current?.showModal();
  }

  return (
    <>
      <Button type="button" variant="secondary" icon={<FileText size={16} aria-hidden="true" />} aria-haspopup="dialog" aria-expanded={date !== null} onClick={openReport}>
        Laporan Harian
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setDate(null)}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-6xl flex-col overflow-hidden overscroll-contain rounded-2xl border border-surface-200 bg-white p-0 text-surface-900 shadow-2xl backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-surface-950/45 open:flex"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3 sm:px-6">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">Laporan Harian</h2>
            {openedAsOwner && <p className="text-xs text-surface-600">Dibuka sebagai Owner</p>}
          </div>
          <button type="button" aria-label="Tutup laporan harian" onClick={() => dialogRef.current?.close()} className="inline-flex size-10 items-center justify-center rounded-lg text-surface-600 hover:bg-surface-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        {date !== null && (
          <>
            <div className="flex shrink-0 flex-wrap items-end gap-x-3 gap-y-2 border-b border-surface-200 px-4 pb-3 sm:px-6">
              <label className="block w-full max-w-56 text-xs font-semibold text-surface-700">
                Tanggal laporan (WIB)
                <input type="date" max={today} value={date} onChange={event => setDate(event.currentTarget.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-surface-300 bg-white px-2.5 py-2 text-sm text-surface-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600" />
              </label>
              <fieldset className="min-w-0">
                <legend className="mb-1 text-xs font-semibold text-surface-700">Tata letak A4</legend>
                <div className="inline-flex flex-wrap gap-1 rounded-lg bg-surface-100 p-1">
                  {([["single", "1 halaman"], ["multiple", "Banyak halaman"]] as const).map(([value, label]) => (
                    <label key={value} className="cursor-pointer">
                      <input type="radio" name={titleId + "-layout"} checked={pageMode === value} onChange={() => setPageMode(value)} className="peer sr-only" />
                      <span className="inline-flex min-h-8 items-center rounded-md px-3 text-xs font-semibold text-surface-600 peer-checked:bg-white peer-checked:text-brand-800 peer-checked:shadow-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand-600">{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            {valid ? <DailyReportResults key={date} date={date} pageMode={pageMode} /> : (
              <>
                <p role="status" className="bg-surface-50 px-4 py-5 text-sm text-surface-600 sm:px-6">Pilih tanggal hari ini atau sebelumnya.</p>
                <DailyReportActions />
              </>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
