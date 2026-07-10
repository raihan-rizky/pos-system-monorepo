import React from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  Boxes,
  FileSpreadsheet,
  History,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { GuideTarget, cx } from "../GuideTarget";
import {
  PreviewButton,
  PreviewField,
  PreviewHeader,
  PreviewMetric,
  PreviewModal,
  PreviewPageRoot,
  PreviewTab,
} from "../PreviewPrimitives";
import type { PreviewContext } from "../types";

export function ProductsPreview(ctx: PreviewContext) {
  const tab = ctx.state === "products-special-prices"
    ? "special"
    : ctx.state === "products-group-activity"
      ? "group"
      : ctx.state === "products-price-history"
        ? "prices"
        : "products";
  const importOpen = ctx.state === "products-import-menu";
  const priceOpen = ctx.state === "products-price-modal";
  const editOpen = ctx.state === "products-edit-drawer";

  return (
    <PreviewPageRoot ctx={ctx} className="bg-[radial-gradient(ellipse_at_top_right,_#eff6ff,_#f8fafc_45%,_#faf5ff)]">
      <GuideTarget ctx={ctx} target="products-primary" className="min-h-[980px] px-7 pb-20 pt-7">
        <PreviewHeader
          eyebrow="INVENTARIS LIVE"
          title="Pusat Produk"
          subtitle="Kelola katalog, harga, dan pantau stok secara real-time."
          icon={Package}
          tone="brand"
          actions={
            <>
              <div className="relative">
                <PreviewButton ctx={ctx} target="products-import" icon={FileSpreadsheet}>Import</PreviewButton>
                {importOpen ? (
                  <div className="absolute right-0 top-12 z-30 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    {['Import Bulk Products','Import Bulk Stock','Import Foto Produk'].map((label) => <p key={label} className="rounded-xl px-3 py-3 text-xs font-bold text-slate-800">{label}</p>)}
                  </div>
                ) : null}
              </div>
              <PreviewButton ctx={ctx} target="products-add-button" icon={Plus} tone="dark">Tambah Produk</PreviewButton>
            </>
          }
        />

        <div className="mt-7 grid grid-cols-4 gap-4">
          <PreviewMetric label="Total Produk" value="1.284" icon={Package} tone="blue" />
          <PreviewMetric label="Peringatan Stok Menipis" value="18" icon={AlertTriangle} tone="amber" />
          <PreviewMetric label="Stok Negatif" value="3" icon={TrendingDown} tone="red" />
          <PreviewMetric label="Nilai Inventaris" value="Rp428 jt" icon={TrendingUp} tone="emerald" />
        </div>

        <div className="mt-6 flex w-fit gap-2 rounded-2xl bg-slate-100/80 p-1.5">
          <span className={cx("inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold", tab === "products" ? "bg-white text-surface-950 shadow-sm" : "text-surface-500")}><Package className="h-4 w-4" />Produk</span>
          <PreviewTab ctx={ctx} target="products-price-history-tab" active={tab === "prices"} icon={History}>Riwayat Harga</PreviewTab>
          <PreviewTab ctx={ctx} target="products-special-price-tab" active={tab === "special"} icon={BadgeDollarSign}>Harga Khusus</PreviewTab>
          <PreviewTab ctx={ctx} target="products-stock-group-tab" active={tab === "group"} icon={Boxes}>Aktivitas Grup</PreviewTab>
        </div>

        {tab === "products" ? <ProductTable ctx={ctx} /> : null}
        {tab === "prices" ? <Panel title="Riwayat Harga" subtitle="Pantau perubahan harga jual setiap produk." rows={['Kertas A4 80gsm · Rp65.000 → Rp68.000','Tinta Epson Black · Rp92.000 → Rp95.000','Art Carton A3 · Rp40.000 → Rp42.000']} /> : null}
        {tab === "special" ? <Panel title="Harga Khusus" subtitle="Atur harga per tipe pelanggan, satuan, kategori, dan brand." rows={['AGEN · Kertas A4 · Rp64.000','INDUSTRI · Tinta Epson · Rp89.000','PEMERINTAH · Art Carton · Rp40.500']} /> : null}
        {tab === "group" ? <Panel title="Aktivitas Grup" subtitle="Riwayat penyesuaian produk yang berbagi stok." rows={['GRP-KERTAS-A4 · Set stok 480 rim','GRP-TINTA-EPSON · Restock 24 botol','GRP-LAMINASI · Koreksi -2 roll']} /> : null}

        {editOpen ? (
          <div className="absolute inset-y-0 right-0 z-40 w-[480px] border-l border-surface-200 bg-white p-6 shadow-2xl">
            <GuideTarget ctx={ctx} target="products-edit-action" className="h-full"><h2 className="text-xl font-black">Ubah Produk</h2><div className="mt-5 space-y-4"><PreviewField label="Nama Produk" value="Kertas A4 80gsm" /><PreviewField label="SKU" value="KRT-A4-80" /><PreviewField label="Harga Jual" value="Rp68.000" /></div></GuideTarget>
          </div>
        ) : null}
        {priceOpen ? (
          <PreviewModal ctx={ctx} target="products-price-action" title="Ubah Harga Produk"><div className="space-y-4"><PreviewField label="Produk" value="Kertas A4 80gsm" /><PreviewField label="Harga Lama" value="Rp65.000" /><PreviewField label="Harga Baru" value="Rp68.000" /></div></PreviewModal>
        ) : null}
      </GuideTarget>
    </PreviewPageRoot>
  );
}

function ProductTable({ ctx }: { ctx: PreviewContext }) {
  return (
    <div className="mt-5 overflow-hidden rounded-[28px] border border-white bg-white/80 shadow-lg">
      <div className="flex items-center gap-4 border-b border-slate-100 p-5">
        <div className="flex flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"><Search className="h-5 w-5" />Cari nama, SKU, atau barcode...</div>
        <span className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold"><SlidersHorizontal className="h-4 w-4" />Filter</span>
      </div>
      <GuideTarget ctx={ctx} target="products-table" className="min-w-[1420px]">
        <div className="grid grid-cols-[70px_300px_180px_150px_170px_160px_150px_160px] bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-wider text-slate-500">
          {['Foto','Produk','Kategori','Harga','Stok Saat Ini','Grup Stok','Status','Aksi'].map((head) => <span key={head}>{head}</span>)}
        </div>
        {[
          ['Kertas A4 80gsm','Kertas','Rp68.000','128 rim','GRP-KERTAS','Aman'],
          ['Tinta Epson Black','Tinta','Rp95.000','34 botol','GRP-EPSON','Aman'],
          ['Art Carton A3','Kertas','Rp42.000','6 pack','-','Menipis'],
          ['Laminating Film','Finishing','Rp88.000','21 roll','GRP-LAM','Aman'],
        ].map((row, index) => (
          <div key={row[0]} className="grid grid-cols-[70px_300px_180px_150px_170px_160px_150px_160px] items-center border-t border-slate-100 px-5 py-4 text-sm text-slate-700">
            <span className="h-10 w-10 rounded-xl bg-blue-50" /><span><strong className="block text-slate-950">{row[0]}</strong><small className="text-slate-400">SKU-{1001 + index}</small></span><span>{row[1]}</span><span className="font-bold">{row[2]}</span>
            {index === 0 ? <GuideTarget ctx={ctx} target="products-stock-field" className="font-black text-slate-950">{row[3]}</GuideTarget> : <span>{row[3]}</span>}
            <span>{row[4]}</span><span className={cx("w-fit rounded-full px-2 py-1 text-xs font-bold", row[5] === 'Menipis' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>{row[5]}</span>
            <span className="flex gap-2">{index === 0 ? <>{ctx.state === "products-edit-drawer" ? <span className="rounded-lg border px-2 py-1 text-xs font-bold">Ubah</span> : <GuideTarget ctx={ctx} target="products-edit-action" className="rounded-lg border px-2 py-1 text-xs font-bold">Ubah</GuideTarget>}{ctx.state === "products-price-modal" ? <span className="rounded-lg border px-2 py-1 text-xs font-bold">Harga</span> : <GuideTarget ctx={ctx} target="products-price-action" className="rounded-lg border px-2 py-1 text-xs font-bold">Harga</GuideTarget>}</> : '•••'}</span>
          </div>
        ))}
      </GuideTarget>
    </div>
  );
}

function Panel({ title, subtitle, rows }: { title: string; subtitle: string; rows: string[] }) {
  return <section className="mt-5 rounded-[28px] border border-white bg-white/80 p-6 shadow-lg"><h2 className="text-xl font-black">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p><div className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-200">{rows.map((row) => <p key={row} className="px-4 py-4 text-sm font-semibold">{row}</p>)}</div></section>;
}
