"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import { formatRupiah } from "@/lib/utils";
import { DAILY_INCOME_PERMISSIONS, jakartaToday, type DailyIncomeAccess } from "../helpers/daily-income";
import { useDailyIncome } from "../hooks/useDailyIncome";

function IncomeBreakdown({ title, rows }: { title: string; rows: Array<{ label: string; amount: number }> }) {
  return <section className="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm">
    <h2 className="border-b border-surface-100 px-5 py-4 text-sm font-semibold text-surface-900">{title}</h2>
    {rows.length === 0 ? <p className="px-5 py-8 text-sm text-surface-500">Belum ada pemasukan pada tanggal ini.</p> :
      <dl className="divide-y divide-surface-100">{rows.map(row => <div key={row.label} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <dt className="min-w-0 break-words text-sm text-surface-700">{row.label}</dt>
        <dd className="text-sm font-semibold tabular-nums text-surface-900">{formatRupiah(row.amount)}</dd>
      </div>)}</dl>}
  </section>;
}

export function DailyIncomeReport() {
  const { canPerform } = useRole();
  const access = Object.fromEntries(Object.entries(DAILY_INCOME_PERMISSIONS).map(([key, target]) => [key, canPerform(target, "read")])) as DailyIncomeAccess;
  const [date, setDate] = useState(jakartaToday);
  const { data, isLoading, isFetching, error, refetch } = useDailyIncome(date, access);
  const hasAccess = Object.values(access).some(Boolean);
  const report = !error && !isLoading && data?.date === date ? data : undefined;
  return <main className="flex-1 overflow-y-auto bg-surface-50/40">
    <header className="border-b border-surface-100 bg-white px-4 py-5 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-xl font-bold text-surface-900">Pemasukan Harian</h1><p className="mt-1 text-sm text-surface-500">Uang diterima toko pada tanggal pilihan, mengikuti WIB.</p></div>
        {hasAccess && <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm text-surface-700">Tanggal pemasukan
            <input type="date" value={date} max={jakartaToday()} onChange={event => { if (event.target.value) setDate(event.target.value); }} className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500" />
          </label>
          <button type="button" onClick={() => void refetch()} disabled={isFetching} aria-label="Muat ulang pemasukan harian" className="rounded-lg border border-surface-200 p-2.5 text-surface-700 hover:bg-surface-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50"><RefreshCw size={18} className={isFetching ? "animate-spin" : ""} /></button>
        </div>}
      </div>
    </header>
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      {!hasAccess ? <p className="text-sm text-surface-600">Akses pemasukan harian belum diizinkan. Hubungi Owner untuk mengatur hak akses.</p> : error ?
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error.message} <button type="button" onClick={() => void refetch()} className="font-semibold underline">Coba lagi</button></div> : isLoading || !report ?
          <p role="status" className="text-sm text-surface-500">Memuat pemasukan harian...</p> : <>
            {access.total && report.total !== undefined && <section className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm"><h2 className="text-sm font-medium text-surface-600">Total Pemasukan</h2><p className="mt-2 break-words text-3xl font-bold tabular-nums text-surface-900">{formatRupiah(report.total)}</p></section>}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {access.categories && report.categories && <IncomeBreakdown title="Pemasukan per Kategori" rows={report.categories.map(row => ({ label: row.category, amount: row.amount }))} />}
              {access.subcategories && report.subcategories && <IncomeBreakdown title="Pemasukan per Subkategori" rows={report.subcategories.map(row => ({ label: `${row.category} / ${row.subcategory}`, amount: row.amount }))} />}
              {access.paymentMethods && report.paymentMethods && <IncomeBreakdown title="Pemasukan per Metode Pembayaran" rows={report.paymentMethods.map(row => ({ label: row.method === "CASH" ? "Tunai" : row.method, amount: row.amount }))} />}
            </div>
            {access.paymentMethods && report.paymentMethods?.some(row => row.method === "Belum dicatat") && <p className="text-xs text-surface-500">Metode pembayaran pemasukan manual belum dicatat.</p>}
          </>}
    </div>
  </main>;
}
