"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, X } from "lucide-react";
import { formatRupiahPrecise } from "@/lib/utils";
import { useReceiptHistory } from "@/features/transaction-history/hooks/useReceiptHistory";

type AmountBreakdown = {
  paymentBreakdown?: Array<{ method: string; amount: number }>;
  categoryBreakdown?: Array<{ category: string; amount: number }>;
};
type ReceiptRow = AmountBreakdown & {
  key: string;
  label: string;
  date: string;
  amount: number;
  manual: boolean;
  href?: string;
};
type Props = {
  date: string;
  total: number;
  paymentMethods?: Array<{ method: string; amount: number }>;
  previewSales?: boolean;
  onClose: () => void;
};

const methodLabels: Record<string, string> = {
  CASH: "Tunai", TRANSFER: "Transfer", DEBIT: "Debit", CREDIT: "Kredit", QRIS: "QRIS",
};
const methodLabel = (method: string) => methodLabels[method] ?? method;

export function DailyIncomeReceiptDialog({ date, total, paymentMethods, previewSales = false, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const { data, isLoading, error, refetch } = useReceiptHistory({ mode: "receipt", date, previewSales });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  const displayDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })
    .format(new Date(`${date}T12:00:00+07:00`));
  const rows: ReceiptRow[] = data ? [
    ...data.items.map(item => ({
      ...item, key: `receipt:${item.transactionId}:${item.date}`, label: item.invoiceNumber || "Nota tanpa nomor", manual: false,
      ...(!previewSales && { href: `/history?${new URLSearchParams({ search: item.invoiceNumber || item.transactionId })}` }),
    })),
    ...(data.manualEntries ?? []).map(item => ({ ...item, key: `manual:${item.id}`, label: item.description || "Pemasukan manual", manual: true })),
  ] : [];
  const toggle = (key: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return <dialog ref={dialogRef} onClose={onClose} aria-labelledby="daily-income-receipt-title"
    className="m-auto flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-hidden overscroll-contain rounded-2xl border-0 bg-white p-0 text-[#17384a] shadow-2xl backdrop:overflow-hidden backdrop:bg-[#061d2b]/60 backdrop:overscroll-contain">
    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#dce9ed] px-5 py-4 sm:px-6">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-[#587586]">Penerimaan harian</p><h2 id="daily-income-receipt-title" className="mt-1 text-lg font-bold">Rincian pemasukan</h2></div>
      <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Tutup rincian pemasukan" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#385e70] hover:bg-[#f1f7fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"><X size={20} aria-hidden="true" /></button>
    </header>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6">
      <section aria-label="Ringkasan pemasukan" className="rounded-xl bg-[#073149] p-5 text-white">
        <p className="text-sm text-[#c1dce9]">{displayDate} · WIB</p>
        <p className="mt-2 text-xs font-medium text-[#c1dce9]">Total pemasukan</p>
        <p className="mt-1 break-all font-mono text-2xl font-bold tabular-nums sm:text-3xl">{formatRupiahPrecise(total)}</p>
        {data && <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-white/20 pt-3 text-sm text-[#d7edf5]">
          <span>{data.items.length} nota terlihat</span>
          {data.manualDetailsAvailable && <span>{data.manualEntries?.length ?? 0} pemasukan manual terlihat</span>}
        </div>}
      </section>
      {paymentMethods && paymentMethods.length > 0 && <section aria-label="Ringkasan metode pembayaran" className="space-y-2">
        <h3 className="text-sm font-bold">Metode pembayaran</h3>
        <div className="flex flex-wrap gap-2">{paymentMethods.map(row => <div key={row.method} className="rounded-lg border border-[#dce9ed] bg-[#f6fafc] px-3 py-2 text-sm"><span className="text-[#587586]">{methodLabel(row.method)}</span><span className="ml-2 font-mono font-semibold tabular-nums">{formatRupiahPrecise(row.amount)}</span></div>)}</div>
      </section>}
      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error.message} <button type="button" onClick={() => void refetch()} className="min-h-11 font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700">Coba lagi</button></div>
        : isLoading || !data ? <p role="status" className="text-sm text-[#587586]">Memuat rincian pemasukan...</p> : <>
          {!data.manualDetailsAvailable && <p className="rounded-lg border border-[#c9dce6] bg-[#f1f7fb] p-3 text-sm text-[#385e70]">Akses untuk sebagian rincian pemasukan belum tersedia. Hubungi Owner untuk melihat rincian lengkap.</p>}
          {rows.length === 0 ? <p className="rounded-xl border border-[#dce9ed] p-5 text-sm text-[#587586]">Belum ada penerimaan yang dapat ditampilkan pada tanggal ini.</p> : <section aria-label="Daftar penerimaan">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-bold">Penerimaan yang terlihat</h3><p className="text-xs text-[#587586]">Nominal yang diterima pada tanggal pilihan</p></div>
            <ul className="divide-y divide-[#e5eef2] overflow-hidden rounded-xl border border-[#dce9ed]">{rows.map((row, index) => {
              const isExpanded = expanded.has(row.key);
              const hasBreakdown = Boolean(row.paymentBreakdown?.length || row.categoryBreakdown?.length);
              const detailsId = `daily-income-receipt-${index}`;
              return <li key={row.key} className="bg-white">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                  <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                    {row.href ? <Link href={row.href} className="inline-flex min-h-11 max-w-full items-center break-all font-semibold text-blue-800 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">{row.label}</Link> : <p className="break-words font-semibold">{row.label}</p>}
                    <p className="text-xs text-[#587586]">{row.manual ? "Pemasukan manual" : "Nota"} · {row.date}</p>
                  </div>
                  <div className="flex w-full max-w-full flex-wrap items-center justify-between gap-x-3 sm:w-auto sm:justify-end"><span className="break-all font-mono text-sm font-bold tabular-nums">{formatRupiahPrecise(row.amount)}</span>{hasBreakdown && <button type="button" aria-label={`Rincian ${row.label}`} aria-expanded={isExpanded} aria-controls={detailsId} onClick={() => toggle(row.key)} className="inline-flex min-h-11 items-center gap-1 rounded text-sm font-semibold text-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">Rincian <ChevronDown size={16} aria-hidden="true" className={isExpanded ? "rotate-180" : ""} /></button>}</div>
                </div>
                {isExpanded && <div id={detailsId} className="grid gap-4 border-t border-[#edf3f6] bg-[#f6fafc] px-4 py-4 text-sm sm:grid-cols-2">
                  {row.paymentBreakdown && row.paymentBreakdown.length > 0 && <section><h4 className="mb-2 text-xs font-semibold text-[#587586]">Metode pembayaran</h4><dl className="space-y-1">{row.paymentBreakdown.map(item => <div key={item.method} className="flex flex-wrap justify-between gap-x-3"><dt>{methodLabel(item.method)}</dt><dd className="font-mono font-semibold tabular-nums">{formatRupiahPrecise(item.amount)}</dd></div>)}</dl></section>}
                  {row.categoryBreakdown && row.categoryBreakdown.length > 0 && <section><h4 className="mb-2 text-xs font-semibold text-[#587586]">Kategori</h4><dl className="space-y-1">{row.categoryBreakdown.map(item => <div key={item.category} className="flex flex-wrap justify-between gap-x-3"><dt>{item.category}</dt><dd className="font-mono font-semibold tabular-nums">{formatRupiahPrecise(item.amount)}</dd></div>)}</dl></section>}
                </div>}
              </li>;
            })}</ul>
          </section>}
        </>}
    </div>
  </dialog>;
}
