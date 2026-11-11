"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import { formatRupiahPrecise } from "@/lib/utils";
import { buildReceiptHistoryUrl, type ReceiptHistoryContext } from "@/features/transaction-history/helpers/receipt-history";
import { DAILY_INCOME_PERMISSIONS, jakartaToday, type DailyIncomeAccess } from "../helpers/daily-income";
import { useDailyIncome } from "../hooks/useDailyIncome";

type BreakdownRow = { label: string; amount: number; href?: string };
function IncomeBreakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return <section className="min-w-0">
    <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="text-base font-bold text-[#17384a]">{title}</h2><span className="text-xs text-[#587586]">Penerimaan</span></div>
    <div className="overflow-hidden rounded-xl border border-[#dce9ed] bg-white">
      {rows.length === 0 ? <p className="px-4 py-7 text-sm text-surface-600">Belum ada pemasukan pada tanggal ini.</p> :
        <dl className="divide-y divide-[#edf3f6]">{rows.map(row => <div key={row.label} className="flex flex-wrap items-center justify-between gap-x-4 px-4 py-1">
          <dt className="min-w-0 break-words py-2 text-sm text-[#294b5d]"><span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-sm bg-[#129bd5]" />{row.label}</dt>
          <dd className="min-w-0 text-right text-sm font-semibold tabular-nums text-[#17384a]">{row.href ? <Link href={row.href} aria-label={`Lihat rincian ${row.label}: ${formatRupiahPrecise(row.amount)}`} className="inline-flex min-h-11 items-center gap-2 rounded text-blue-800 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{formatRupiahPrecise(row.amount)}<ArrowRight size={15} aria-hidden="true" /></Link> : <span className="inline-flex min-h-11 items-center">{formatRupiahPrecise(row.amount)}</span>}</dd>
        </div>)}</dl>}
    </div>
  </section>;
}

export function DailyIncomeReport({ previewSales = false, fullReportPreview }: { previewSales?: boolean; fullReportPreview?: ReactNode } = {}) {
  const { canPerform, canAccess } = useRole();
  const access = Object.fromEntries(Object.entries(DAILY_INCOME_PERMISSIONS).map(([key, target]) => [key, canPerform(target, "read")])) as DailyIncomeAccess;
  const [date, setDate] = useState(jakartaToday);
  const { data, isLoading, isFetching, error, refetch } = useDailyIncome(date, access, previewSales);
  const hasAccess = Object.values(access).some(Boolean);
  const report = !error && !isLoading && data?.date === date ? data : undefined;
  if (previewSales && report?.viewMode === "full" && fullReportPreview) return fullReportPreview;
  const historyGate = canAccess("/history") && canPerform("transaction", "read");
  const canOpen = (section: "total" | "category" | "subcategory" | "method" | "outstandingDp") => historyGate && (!previewSales || report?.receiptHistoryAccess?.[section] === true);
  const hrefFor = (section: "total" | "category" | "subcategory" | "method" | "outstandingDp", extra: Partial<ReceiptHistoryContext> = {}) => canOpen(section)
    ? buildReceiptHistoryUrl({ date, mode: section === "outstandingDp" ? "outstanding-dp" : "receipt", previewSales, ...extra }) : undefined;
  const anyHistoryUnavailable = report && ((report.total !== undefined && !canOpen("total")) || (report.outstandingDp !== undefined && !canOpen("outstandingDp")) || (report.categories && !canOpen("category")) || (report.subcategories && !canOpen("subcategory")) || (report.paymentMethods && !canOpen("method")));
  const totalHref = hrefFor("total");
  const dpHref = hrefFor("outstandingDp");
  return <main className="flex-1 overflow-y-auto bg-[#f1f7fb]">
    <header className="border-b border-[#dce9ed] bg-white px-4 py-5 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold text-[#326279]">Ringkasan toko</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-[#142f40]">Pemasukan Harian</h1><p className="mt-1 text-sm text-[#587586]">Uang diterima toko pada tanggal pilihan, mengikuti WIB.</p></div>
        {hasAccess && <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-[#294b5d]">Tanggal pemasukan
            <input type="date" value={date} max={jakartaToday()} onChange={event => { if (event.target.value) setDate(event.target.value); }} className="min-h-11 rounded-lg border border-[#c9dce6] bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700" />
          </label>
          <button type="button" onClick={() => void refetch()} disabled={isFetching} aria-label="Muat ulang pemasukan harian" className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[#c9dce6] text-[#294b5d] hover:bg-[#f1f7fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-50"><RefreshCw size={18} className={isFetching ? "motion-safe:animate-spin" : ""} /></button>
        </div>}
      </div>
    </header>
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {!hasAccess ? <p className="text-sm text-surface-600">Akses pemasukan harian belum diizinkan. Hubungi Owner untuk mengatur hak akses.</p> : error ?
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error.message} <button type="button" onClick={() => void refetch()} className="min-h-11 font-semibold underline">Coba lagi</button></div> : isLoading || !report ?
          <p role="status" className="text-sm text-surface-600">Memuat pemasukan harian...</p> : <>
            {anyHistoryUnavailable && <p className="rounded-lg border border-[#c9dce6] bg-white p-3 text-sm text-[#385e70]">Akses Riwayat belum diizinkan untuk sebagian rincian. Hubungi Owner untuk mengatur hak akses.</p>}
            <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              {access.total && report.total !== undefined && <section className="min-w-0 rounded-2xl bg-[#073149] p-5 text-white sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#c1dce9]"><h2 className="font-medium">Total Pemasukan</h2><span>Harian · WIB</span></div>
                {totalHref ? <Link href={totalHref} aria-label={`Lihat rincian Total Pemasukan: ${formatRupiahPrecise(report.total)}`} className="mt-4 inline-flex min-h-11 max-w-full items-center break-all rounded text-3xl font-bold tabular-nums tracking-tight underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:text-4xl">{formatRupiahPrecise(report.total)}</Link> : <p className="mt-4 break-all text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">{formatRupiahPrecise(report.total)}</p>}
                <p className="mt-2 text-sm text-[#c1dce9]">Uang diterima pada tanggal pilihan</p>{totalHref && <div className="mt-5 border-t border-white/20 pt-1"><Link href={totalHref} className="inline-flex min-h-11 items-center gap-2 rounded text-sm font-medium text-[#b8ebff] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Lihat rincian di Riwayat <ArrowRight size={16} aria-hidden="true" /></Link></div>}</section>}
              {access.outstandingDp && report.outstandingDp !== undefined && <section className="min-w-0 rounded-2xl border border-[#dce9ed] bg-white p-5"><p className="text-xs font-medium text-[#587586]">Sisa yang belum lunas</p><h2 className="mt-1 text-sm font-bold text-[#17384a]">Outstanding DP</h2>
                {dpHref ? <Link href={dpHref} aria-label={`Lihat rincian Outstanding DP: ${formatRupiahPrecise(report.outstandingDp)}`} className="mt-2 inline-flex min-h-11 max-w-full items-center gap-2 break-all rounded text-2xl font-bold tabular-nums text-blue-800 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{formatRupiahPrecise(report.outstandingDp)}<ArrowRight size={16} aria-hidden="true" /></Link> : <p className="mt-2 break-all text-2xl font-bold tabular-nums text-[#17384a]">{formatRupiahPrecise(report.outstandingDp)}</p>}
                <p className="mt-2 text-xs leading-relaxed text-[#587586]">Sisa DP saat ini dari nota hingga tanggal pilihan. Tidak termasuk Tempo. Mengikuti pembayaran terbaru, bukan saldo historis.</p></section>}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              {access.categories && report.categories && <IncomeBreakdown title="Pemasukan per Kategori" rows={report.categories.map(row => ({ label: row.category, amount: row.amount, href: hrefFor("category", { category: row.category }) }))} />}
              {access.subcategories && report.subcategories && <IncomeBreakdown title="Pemasukan per Subkategori" rows={report.subcategories.map(row => ({ label: `${row.category} / ${row.subcategory}`, amount: row.amount, href: hrefFor("subcategory", { category: row.category, subcategory: row.subcategory }) }))} />}
              {access.paymentMethods && report.paymentMethods && <IncomeBreakdown title="Pemasukan per Metode Pembayaran" rows={report.paymentMethods.map(row => ({ label: row.method === "CASH" ? "Tunai" : row.method, amount: row.amount, href: hrefFor("method", { method: row.method }) }))} />}
            </div>
            {access.paymentMethods && report.paymentMethods?.some(row => row.method === "Belum dicatat") && <p className="text-xs text-[#587586]">Metode pembayaran pemasukan manual belum dicatat.</p>}
          </>}
    </div>
  </main>;
}
