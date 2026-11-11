"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatRupiahPrecise } from "@/lib/utils";
import { jakartaToday } from "@/features/financial-report/helpers/daily-income";
import { buildReceiptHistoryUrl, receiptHistoryRange, type ReceiptHistoryContext } from "../helpers/receipt-history";
import { useReceiptHistory } from "../hooks/useReceiptHistory";
import type { TransactionHistoryQuickDateFilter } from "../helpers/date-range";

const filters: Array<{ value: TransactionHistoryQuickDateFilter; label: string }> = [
  { value: "daily", label: "Harian" }, { value: "weekly", label: "Mingguan" }, { value: "monthly", label: "Bulanan" },
];

export function ReceiptHistoryClient({ context }: { context: ReceiptHistoryContext }) {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useReceiptHistory(context);
  const period = context.period ?? "daily";
  const range = receiptHistoryRange(context.date, period);
  const isDp = context.mode === "outstanding-dp";
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
        {!isDp && <p className="w-full text-sm text-surface-600">{range.dateFrom === range.dateTo ? range.dateTo : `${range.dateFrom} – ${range.dateTo}`} · WIB</p>}
      </div>
      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error.message} <button type="button" onClick={() => void refetch()} className="min-h-11 font-semibold underline">Coba lagi</button></div>
        : isLoading || !data ? <p role="status" className="text-sm text-surface-600">Memuat riwayat penerimaan...</p>
          : <>
            {!isDp && !data.manualDetailsAvailable && <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">Akses untuk sebagian rincian pemasukan belum tersedia. Hubungi Owner untuk melihat rincian lengkap.</p>}
            {data.items.length === 0 && (!data.manualEntries || data.manualEntries.length === 0) ? <p className="rounded-xl border border-surface-200 bg-white p-6 text-sm text-surface-600">Belum ada {isDp ? "sisa DP" : "penerimaan yang dapat ditampilkan"} pada pilihan ini.</p> :
              <ul className="divide-y divide-surface-200 overflow-hidden rounded-xl border border-surface-200 bg-white">
                {data.items.map(item => <li key={`${item.transactionId}:${item.date}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">{context.previewSales ? <p className="break-all font-semibold text-surface-900">{item.invoiceNumber || "Nota tanpa nomor"}</p> : <Link href={`/history?${new URLSearchParams({ search: item.invoiceNumber || item.transactionId })}`} className="inline-flex min-h-11 items-center break-all font-semibold text-blue-800 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">{item.invoiceNumber || "Lihat nota"}</Link>}<p className="text-xs text-surface-500">{item.date}{item.methods.length ? ` · ${item.methods.join(", ")}` : ""}</p></div>
                  <span className="font-semibold tabular-nums text-surface-900">{formatRupiahPrecise(item.amount)}</span>
                </li>)}
                {data.manualEntries?.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"><div className="min-w-0"><p className="break-words font-semibold text-surface-900">{item.description || "Pemasukan manual"}</p><p className="text-xs text-surface-500">Pemasukan manual · {item.date}{item.methods.length ? ` · ${item.methods.join(", ")}` : ""}</p></div><span className="font-semibold tabular-nums text-surface-900">{formatRupiahPrecise(item.amount)}</span></li>)}
              </ul>}
          </>}
    </div>
  </main>;
}
