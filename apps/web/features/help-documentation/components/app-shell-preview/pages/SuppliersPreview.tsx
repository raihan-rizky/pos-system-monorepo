import React from "react";
import { Boxes, Building2, Plus, Search, ShoppingCart, Store, Upload } from "lucide-react";

import { GuideTarget, cx } from "../GuideTarget";
import {
  PreviewButton,
  PreviewField,
  PreviewMetric,
  PreviewModal,
  PreviewPageRoot,
} from "../PreviewPrimitives";
import type { PreviewContext } from "../types";

export function SuppliersPreview(ctx: PreviewContext) {
  const shopping = ["suppliers-shopping", "suppliers-request-open", "suppliers-approve-open"].includes(ctx.state);
  const formOpen = ctx.state === "suppliers-form-open";
  const requestOpen = ctx.state === "suppliers-request-open";
  const approveOpen = ctx.state === "suppliers-approve-open";

  return (
    <PreviewPageRoot ctx={ctx} className="bg-slate-50">
      <GuideTarget ctx={ctx} target="suppliers-primary" className="min-h-[960px] px-6 pb-16 pt-5">
        <div className="flex items-end justify-between">
          <div><p className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-cyan-700"><Store className="h-3 w-3" />Manajemen Supplier</p><h1 className="text-2xl font-black text-slate-950">Supplier</h1><p className="text-sm text-slate-500">Kelola supplier dan pantau rekap stock in dari pembelian.</p></div>
          <div className="flex gap-2"><span className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-xs font-bold"><Upload className="h-4 w-4" />Import Supplier</span>{formOpen ? <span className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white"><Plus className="h-4 w-4" />Tambah Supplier</span> : <PreviewButton ctx={ctx} target="suppliers-add" tone="brand" icon={Plus}>Tambah Supplier</PreviewButton>}</div>
        </div>

        <div className="mt-5 flex gap-2">
          <span className={cx("inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold", !shopping ? 'bg-white shadow-sm' : 'text-slate-500')}><Building2 className="h-4 w-4" />Supplier</span>
          <span className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500"><Boxes className="h-4 w-4" />Rekap Stock In</span>
          <GuideTarget ctx={ctx} target="suppliers-shopping-tab" className={cx("inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold", shopping ? 'bg-white shadow-sm' : 'text-slate-500')}><ShoppingCart className="h-4 w-4" />Daftar Belanja</GuideTarget>
        </div>

        {!shopping ? <SupplierList ctx={ctx} /> : <ShoppingPanel ctx={ctx} />}
      </GuideTarget>

      {formOpen ? <PreviewModal ctx={ctx} target="suppliers-add" title="Tambah Supplier"><div className="grid grid-cols-2 gap-4"><PreviewField label="Kode Supplier" value="SUP-0042" /><PreviewField label="Tipe" value="DISTRIBUTOR" /><PreviewField label="Nama Supplier" value="CV Sumber Rezeki" /><PreviewField label="Nomor Telepon" value="0812 9000 1122" /></div></PreviewModal> : null}
      {requestOpen ? <RequestModal ctx={ctx} /> : null}
      {approveOpen ? <PreviewModal ctx={ctx} target="suppliers-approve" title="Approve Daftar Belanja"><p className="text-sm font-bold">Kebutuhan Belanja</p><div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">12 rim Kertas A4 · 6 botol Tinta Epson · 4 roll Laminasi</div></PreviewModal> : null}
    </PreviewPageRoot>
  );
}

function SupplierList({ ctx }: { ctx: PreviewContext }) {
  return <div className="mt-5 space-y-4"><div className="grid grid-cols-4 gap-3"><PreviewMetric label="Total Pembelian" value="Rp184 jt" tone="blue" /><PreviewMetric label="Qty Restock" value="2.840" tone="emerald" /><PreviewMetric label="Supplier Aktif" value="24" tone="violet" /><PreviewMetric label="Top Supplier" value="Sumber Rezeki" tone="amber" /></div><div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex flex-1 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm text-slate-500"><Search className="h-4 w-4" />Cari kode, nama, kontak, atau telepon...</div><span className="rounded-xl border px-4 py-2.5 text-sm">Semua tipe</span><span className="rounded-xl border px-4 py-2.5 text-sm">□ Tampilkan nonaktif</span></div><GuideTarget ctx={ctx} target="suppliers-list" className="grid grid-cols-2 gap-3">{['CV Sumber Rezeki','Toko Bahan Prima','Fresh Dairy','Kemasan Makmur'].map((name, index) => <article key={name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex justify-between"><div><p className="text-xs font-bold text-cyan-700">SUP-00{index+1} · DISTRIBUTOR</p><h2 className="mt-1 text-base font-black">{name}</h2></div><span className="h-fit rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">Aktif</span></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500"><span>Pembelian Rp{18+index*7} jt</span><span>{12+index*4} stock-in</span></div></article>)}</GuideTarget><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-base font-black">Rekap Stock In</h2><p className="mt-1 text-sm text-slate-500">Hanya restock supplier yang sudah disetujui.</p></section></div>;
}

function ShoppingPanel({ ctx }: { ctx: PreviewContext }) {
  const requestOpen = ctx.state === "suppliers-request-open";
  const approveOpen = ctx.state === "suppliers-approve-open";
  return <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-base font-black">Daftar Belanja</h2><p className="mt-1 text-sm text-slate-500">Buat dan cetak daftar kebutuhan barang untuk pengajuan belanja.</p></div>{requestOpen ? <span className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white"><Plus className="h-4 w-4" />Buat Daftar Belanja</span> : <PreviewButton ctx={ctx} target="suppliers-create-request" tone="brand" icon={Plus}>Buat Daftar Belanja</PreviewButton>}</div><div className="mt-5 overflow-hidden rounded-xl border"><div className="grid grid-cols-[190px_1fr_180px_150px] bg-slate-50 p-3 text-xs font-bold"><span>No. Daftar</span><span>Supplier / Kebutuhan</span><span>Status</span><span>Aksi</span></div>{['DB-20260710-004','DB-20260709-011','DB-20260708-009'].map((id,index) => <div key={id} className="grid grid-cols-[190px_1fr_180px_150px] border-t p-4 text-sm"><strong>{id}</strong><span>{index ? 'Kemasan dan tinta' : 'Kertas dan bahan finishing'}</span><span className="text-amber-700">Menunggu approval</span>{index === 0 ? approveOpen ? <span className="font-bold text-brand-700">Setujui Belanja</span> : <GuideTarget ctx={ctx} target="suppliers-approve" className="font-bold text-brand-700">Setujui Belanja</GuideTarget> : <span>Detail</span>}</div>)}</div></section>;
}

function RequestModal({ ctx }: { ctx: PreviewContext }) {
  return <PreviewModal ctx={ctx} target="suppliers-create-request" title="Buat Daftar Belanja" width="max-w-4xl"><PreviewField label="Supplier Tujuan (Opsional)" value="CV Sumber Rezeki" /><GuideTarget ctx={ctx} target="suppliers-add-products" className="mt-4 rounded-xl border p-4"><p className="text-sm font-black">Cari & Tambah Produk</p><div className="mt-3 grid grid-cols-[1fr_180px] gap-3"><span className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Cari kertas, tinta, atau kemasan...</span><GuideTarget ctx={ctx} target="suppliers-request-quantity" className="rounded-xl border p-3 text-sm font-bold">Requested Quantity: 12</GuideTarget></div></GuideTarget></PreviewModal>;
}
