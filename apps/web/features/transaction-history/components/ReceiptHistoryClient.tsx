"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { formatRupiahPrecise } from "@/lib/utils";
import { jakartaToday } from "@/features/financial-report/helpers/daily-income";
import { buildReceiptHistoryUrl, receiptHistoryRange, selectReceiptRows, summarizeReceiptRows, type ReceiptHistoryContext, type ReceiptKind } from "../helpers/receipt-history";
import { useReceiptHistory } from "../hooks/useReceiptHistory";
import type { TransactionHistoryQuickDateFilter } from "../helpers/date-range";

const filters: Array<{ value: TransactionHistoryQuickDateFilter; label: string }> = [
  { value: "daily", label: "Harian" }, { value: "weekly", label: "Mingguan" }, { value: "monthly", label: "Bulanan" },
];
const receiptKinds: Array<{ value: ReceiptKind; label: string }> = [
  { value: "all", label: "Semua jenis" }, { value: "nota", label: "Nota" }, { value: "receivable-nota", label: "Piutang Nota" },
  { value: "manual-income", label: "Pemasukan Manual" }, { value: "manual-receivable", label: "Piutang Manual" },
];
const ReceiptHistoryReceiptDialog = dynamic(() => import("./ReceiptHistoryReceiptDialog").then(module => module.ReceiptHistoryReceiptDialog), { ssr: false });

export function ReceiptHistoryClient({ context }: { context: ReceiptHistoryContext }) {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useReceiptHistory(context);
  const period = context.period ?? "daily";
  const range = receiptHistoryRange(context.date, period);
  const isDp = context.mode === "outstanding-dp";
  const [kind, setKind] = useState<ReceiptKind>("all");
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const receiptTrigger = useRef<HTMLButtonElement | null>(null);
  const visible = data ? selectReceiptRows(data, isDp ? "all" : kind) : null;
  const visibleRows = visible ? [...visible.items, ...visible.manualEntries, ...visible.manualReceivableEntries] : [];
  const visibleTotal = visibleRows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
  const displayedTotal = kind === "all" && !isDp && data?.receiptTotal !== undefined ? data.receiptTotal : visibleTotal;
  const hasHiddenDetails = Math.round(displayedTotal * 100) !== Math.round(visibleTotal * 100);
  const composition = visible ? summarizeReceiptRows(visible) : [];
  const share = visible && visible.items.length > 0
    ? (visible.items.filter(item => item.isReceivableNota).length / visible.items.length * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })
    : "0";
  const update = (change: Partial<ReceiptHistoryContext>) => router.push(buildReceiptHistoryUrl({ ...context, ...change }));
  const description = [context.category, context.subcategory, context.method === "CASH" ? "Tunai" : context.method].filter(Boolean).join(" · ");
  return <main className="flex-1 overflow-y-auto bg-surface-50/40">
    <header className="border-b border-surface-200 bg-white px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Link href="/history" className="inline-flex min-h-11 items-center text-sm font-medium text-blue-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">← {context.previewSales ? "Keluar dari pratinjau Sales" : "Riwayat transaksi"}</Link>
        <h1 className="text-2xl font-bold text-surface-900">{isDp ? "Rincian Outstanding DP" : "Riwayat penerimaan"}</h1>
        <p className="mt-1 text-sm text-surface-600">{isDp ? "Sisa DP terkini untuk nota hingga tanggal pilihan, tidak termasuk Tempo." : "Berdasarkan tanggal uang diterima, termasuk pelunasan nota sebelumnya."}</p>
        {context.previewSales && <p className="mt-2 text-sm text-surface-600">Pratinjau menggunakan izin Sales. Keluar dari pratinjau untuk membuka nota dengan hak akun Anda.</p>}
        {description && <p className="mt-2 break-words text-sm font-medium text-blue-800">Filter: {description}</p>}
      </div>
    </header>
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-surface-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-surface-700">Tanggal pilihan
          <input type="date" value={context.date} max={jakartaToday()} onChange={event => { if (event.target.value) update({ date: event.target.value }); }} className="min-h-11 rounded-lg border border-surface-300 px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700" />
        </label>
        {!isDp && <div className="flex flex-wrap gap-1" aria-label="Rentang penerimaan">{filters.map(filter => <button key={filter.value} type="button" aria-pressed={period === filter.value} onClick={() => update({ period: filter.value })} className={`min-h-11 rounded-lg px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 ${period === filter.value ? "bg-blue-800 text-white" : "text-surface-700 hover:bg-surface-100"}`}>{filter.label}</button>)}</div>}
        {!isDp && <label className="flex flex-col gap-1 text-sm font-medium text-surface-700">Jenis transaksi
          <select value={kind} onChange={event => setKind(event.target.value as ReceiptKind)} className="min-h-11 max-w-full rounded-lg border border-surface-300 bg-white px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">{receiptKinds.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        </label>}
        {!isDp && <p className="w-full text-sm text-surface-600">{range.dateFrom === range.dateTo ? range.dateTo : `${range.dateFrom} – ${range.dateTo}`} · WIB</p>}
      </div>
      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error.message} <button type="button" onClick={() => void refetch()} className="min-h-11 font-semibold underline">Coba lagi</button></div>
        : isLoading || !data ? <p role="status" className="text-sm text-surface-600">Memuat riwayat penerimaan...</p>
          : <>
            {!isDp && !data.manualDetailsAvailable && <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">Akses untuk sebagian rincian pemasukan belum tersedia. Hubungi Owner untuk melihat rincian lengkap.</p>}
            {!isDp && data.manualReceivableDetailsAvailable === false && <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">Akses rincian Piutang Manual belum diizinkan. Hubungi Owner untuk melihat rincian lengkap.</p>}
            {!isDp && <section aria-label="Ringkasan penerimaan" className="space-y-3 rounded-xl border border-surface-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><div><h2 className="text-sm font-semibold text-surface-900">Ringkasan penerimaan</h2><p className="text-xs text-surface-600">{visibleRows.length} rincian terlihat · {share}% baris nota merupakan pelunasan Piutang Nota</p></div><p className="text-xl font-bold tabular-nums text-surface-900">{formatRupiahPrecise(displayedTotal)}</p></div>
              {hasHiddenDetails && kind === "all" && <p className="text-xs text-surface-600">Total penerimaan mencakup sumber yang rincian identitasnya tidak tersedia untuk akun ini.</p>}
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{composition.filter(row => row.count > 0).map(row => <li key={row.kind} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-surface-200 px-3 py-2"><span className="min-w-0"><span aria-hidden="true" className={`mr-2 inline-block h-2.5 w-2.5 rounded-sm ${row.kind === "nota" ? "bg-blue-600" : row.kind === "receivable-nota" ? "bg-violet-600" : row.kind === "manual-income" ? "bg-emerald-600" : "bg-amber-500"}`} />{row.label}<span className="ml-1 text-xs text-surface-600">{row.count} · {row.percent}%</span></span><span className="shrink-0 text-sm font-semibold tabular-nums text-surface-900">{formatRupiahPrecise(row.amount)}</span></li>)}</ul>
            </section>}
            {visibleRows.length === 0 ? <p className="rounded-xl border border-surface-200 bg-white p-6 text-sm text-surface-600">Belum ada {isDp ? "sisa DP" : "penerimaan yang dapat ditampilkan"} pada pilihan ini.</p> :
              <ul className="divide-y divide-surface-200 overflow-hidden rounded-xl border border-surface-200 bg-white">
                {visible?.items.map(item => {
                  const content = <><div className="min-w-0"><p className={`break-all font-semibold ${context.previewSales ? "text-surface-900" : "text-blue-800"}`}>{item.invoiceNumber || "Nota tanpa nomor"}</p><p className="mt-1 text-xs text-surface-600">{isDp ? "" : item.isReceivableNota ? "Piutang Nota · " : "Nota · "}{item.date}{item.methods.length ? ` · ${item.methods.join(", ")}` : ""}</p></div><span className="font-semibold tabular-nums text-surface-900">{formatRupiahPrecise(item.amount)}</span></>;
                  return <li key={`${item.transactionId}:${item.date}`} className={isDp ? "bg-white" : item.isReceivableNota ? "bg-violet-50" : "bg-blue-50"}>
                    {context.previewSales ? <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">{content}</div> : <button type="button" aria-label={item.invoiceNumber ? `Lihat nota ${item.invoiceNumber}` : "Lihat nota tanpa nomor"} onClick={event => { receiptTrigger.current = event.currentTarget; setSelectedTransactionId(item.transactionId); }} className="flex min-h-16 w-full flex-wrap items-center justify-between gap-3 px-4 py-4 text-left hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-700">{content}</button>}
                  </li>;
                })}
                {visible?.manualEntries.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 bg-emerald-50 px-4 py-4"><div className="min-w-0"><p className="break-words font-semibold text-surface-900">{item.description || "Pemasukan manual"}</p><p className="text-xs text-surface-600">Pemasukan Manual · {item.date}{item.methods.length ? ` · ${item.methods.join(", ")}` : ""}</p></div><span className="font-semibold tabular-nums text-surface-900">{formatRupiahPrecise(item.amount)}</span></li>)}
                {visible?.manualReceivableEntries.map(item => <li key={`receivable:${item.id}`} className="flex flex-wrap items-center justify-between gap-3 bg-amber-50 px-4 py-4"><div className="min-w-0"><p className="break-words font-semibold text-surface-900">{item.customerName}</p>{item.description && <p className="break-words text-sm text-surface-700">{item.description}</p>}<p className="text-xs text-surface-600">Piutang Manual · {item.date}{item.methods.length ? ` · ${item.methods.join(", ")}` : ""}</p></div><span className="font-semibold tabular-nums text-surface-900">{formatRupiahPrecise(item.amount)}</span></li>)}
              </ul>}
          </>}
    </div>
    {selectedTransactionId && <ReceiptHistoryReceiptDialog transactionId={selectedTransactionId} onClose={() => { setSelectedTransactionId(null); requestAnimationFrame(() => receiptTrigger.current?.focus()); }} />}
  </main>;
}
