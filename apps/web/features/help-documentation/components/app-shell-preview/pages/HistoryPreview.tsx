import React from "react";
import { CalendarDays, MoreHorizontal, Search, Truck, WalletCards } from "lucide-react";

import { GuideTarget, cx } from "../GuideTarget";
import { PreviewButton, PreviewHeader, PreviewPageRoot } from "../PreviewPrimitives";
import type { PreviewContext } from "../types";

const actionTargets = new Set([
  "history-action-menu",
  "history-print-button",
  "history-surat-jalan-action",
  "history-invoice-date-action",
  "history-upload-proof",
  "history-debt-payment",
]);

export function HistoryPreview(ctx: PreviewContext) {
  const showMenu = actionTargets.has(ctx.activeTarget);
  const showDetail = ctx.activeTarget === "history-detail-panel";

  return (
    <PreviewPageRoot ctx={ctx} className="bg-surface-50">
      <GuideTarget ctx={ctx} target="history-primary" className="min-h-[900px]">
        <div className="border-b border-surface-100 bg-white px-8 pb-6 pt-5">
          <PreviewHeader title="Riwayat Transaksi" subtitle="Daftar seluruh transaksi dan invoice toko" icon={WalletCards} />
        </div>
        <GuideTarget ctx={ctx} target="history-filter" className="space-y-3 border-b border-surface-100 bg-white px-8 py-4">
          <div className="flex gap-3">
            <div className="flex flex-1 items-center gap-3 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-500"><Search className="h-4 w-4" />Cari invoice, pelanggan, nama produk, atau sales...</div>
            <div className="w-48 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm">Semua Kategori</div>
            <div className="w-44 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm">Semua Status</div>
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold text-surface-600"><CalendarDays className="h-4 w-4" />Filter cepat <span className="rounded-lg bg-brand-600 px-3 py-2 text-white">Harian</span><span>Mingguan</span><span>Bulanan</span><span className="ml-4 rounded-xl border px-3 py-2">09 Jul 2026</span><span className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700"><Truck className="h-4 w-4" />Surat Jalan saja</span></div>
        </GuideTarget>

        <div className="relative px-8 py-5">
          <GuideTarget ctx={ctx} target="history-table" className="min-w-[1420px] overflow-visible rounded-2xl border border-surface-200 bg-white shadow-sm">
            <div className="grid grid-cols-[130px_210px_180px_120px_100px_150px_130px_120px_80px] border-b border-surface-200 bg-surface-50 px-4 py-4 text-xs font-bold text-surface-600">
              {['Tanggal','No. Invoice','Pelanggan','Sales','Item','Total','Pembayaran','Status','Aksi'].map((head) => <span key={head}>{head}</span>)}
            </div>
            {[
              ['09 Jul 2026','INV-20260709-0012','Toko Maju','Dina','4 item','Rp1.250.000','Transfer','Pending'],
              ['09 Jul 2026','INV-20260709-0011','Bu Sari','Rafi','2 item','Rp320.000','Tunai','Lunas'],
              ['08 Jul 2026','DRAFT-20260708-0004','Walk-in','-','1 item','Rp88.000','Draft','Draft'],
            ].map((row, index) => (
              <div key={row[1]} className="grid grid-cols-[130px_210px_180px_120px_100px_150px_130px_120px_80px] items-center border-b border-surface-100 px-4 py-4 text-xs text-surface-700">
                {row.map((cell, cellIndex) => <span key={cellIndex} className={cx(cellIndex === 1 || cellIndex === 5 ? "font-bold text-surface-950" : "")}>{cell}</span>)}
                <div className="relative">
                  {index === 0 ? <GuideTarget ctx={ctx} target="history-action-menu" className="flex h-8 w-8 items-center justify-center rounded-lg"><MoreHorizontal className="h-4 w-4" /></GuideTarget> : <MoreHorizontal className="h-4 w-4" />}
                  {index === 0 && showMenu ? <ActionMenu ctx={ctx} /> : null}
                </div>
              </div>
            ))}
          </GuideTarget>

          {ctx.activeTarget === "history-approval-actions" ? (
            <GuideTarget ctx={ctx} target="history-approval-actions" className="mt-4 flex w-fit gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
              <span className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">Setujui</span><span className="rounded-lg bg-red-50 px-4 py-2 text-xs font-bold text-red-700">Tolak</span>
            </GuideTarget>
          ) : null}
          {showDetail ? (
            <GuideTarget ctx={ctx} target="history-detail-panel" className="absolute right-8 top-5 z-20 w-[430px] rounded-2xl border border-surface-200 bg-white p-5 shadow-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Panel Detail</p><h2 className="mt-2 text-lg font-black">INV-20260709-0012</h2><p className="mt-4 text-sm text-surface-500">Toko Maju · 4 item · Transfer</p>
            </GuideTarget>
          ) : null}
        </div>
      </GuideTarget>
    </PreviewPageRoot>
  );
}

function ActionMenu({ ctx }: { ctx: PreviewContext }) {
  const items = [
    ["history-print-button", "Cetak Invoice"],
    ["history-surat-jalan-action", "Cetak Surat Jalan"],
    ["history-invoice-date-action", "Ubah Tanggal Invoice"],
    ["history-upload-proof", "Upload Bukti"],
    ["history-debt-payment", "Bayar Cicilan"],
  ] as const;
  return (
    <div data-help-step-state="history-action-menu-open" className="absolute right-0 top-9 z-30 w-56 rounded-xl border border-surface-200 bg-white p-2 shadow-xl">
      <p className="px-3 py-2 text-xs font-black">Menu Aksi Transaksi</p>
      {items.map(([target, label]) => <GuideTarget key={target} ctx={ctx} target={target} className="rounded-lg px-3 py-2 text-xs font-semibold">{label}</GuideTarget>)}
    </div>
  );
}

