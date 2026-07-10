import React from "react";
import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  ClipboardList,
  LogOut,
  Package,
  PackageOpen,
  Pencil,
  Plus,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { GuideTarget, cx } from "../GuideTarget";
import {
  PreviewButton,
  PreviewField,
  PreviewHeader,
  PreviewMetric,
  PreviewModal,
  PreviewPageRoot,
} from "../PreviewPrimitives";
import type { PreviewContext } from "../types";

type InventoryView = { tab: "Ringkasan" | "Tugas" | "Transaksi" | "Riwayat"; subtab?: string };

function viewForState(state: string): InventoryView {
  if (state === "inventory-inbound") return { tab: "Transaksi", subtab: "Penerimaan Barang" };
  if (state === "inventory-surat-jalan") return { tab: "Transaksi", subtab: "Surat Jalan" };
  if (state === "inventory-out-log") return { tab: "Riwayat", subtab: "Log Stok" };
  if (state === "inventory-stock-log" || state === "inventory-approval" || state === "inventory-correction") return { tab: "Riwayat", subtab: "Log Stok" };
  if (state === "inventory-tasks") return { tab: "Tugas", subtab: "Tugas Harian" };
  return { tab: "Ringkasan" };
}

export function InventoryPreview(ctx: PreviewContext) {
  const view = viewForState(ctx.state);
  const modal = ["inventory-update-modal", "inventory-damaged-modal", "inventory-weekly-proof-modal", "inventory-matching-modal"].includes(ctx.state);

  return (
    <PreviewPageRoot ctx={ctx} className="bg-slate-50">
      <GuideTarget ctx={ctx} target="inventory-primary" className="min-h-[1120px] px-7 pb-20 pt-6">
        <PreviewHeader eyebrow="Manajemen Inventaris" title="Inventaris" subtitle="Pusat kendali stok, tugas gudang, transaksi, dan verifikasi harian." icon={Package} tone="violet" />

        <GuideTarget ctx={ctx} target="inventory-day-session" className="mt-5 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div><p className="text-sm font-black text-emerald-950">Sesi Gudang Hari Ini</p><p className="mt-1 text-xs text-emerald-700">Check in 08:02 · Check out belum dilakukan</p></div><span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">Sedang aktif</span>
        </GuideTarget>

        <GuideTarget ctx={ctx} target="inventory-tabs" className="mt-5 flex gap-2 rounded-2xl bg-slate-100 p-1.5" data-help-active-tab={view.tab}>
          {['Ringkasan','Tugas','Transaksi','Riwayat'].map((tab) => <span key={tab} className={cx("rounded-xl px-5 py-2.5 text-sm font-bold", view.tab === tab ? "bg-white text-slate-950 shadow-sm" : "text-slate-500")}>{tab}</span>)}
        </GuideTarget>

        {view.tab === "Ringkasan" ? <Summary ctx={ctx} /> : null}
        {view.tab === "Tugas" ? <Tasks ctx={ctx} /> : null}
        {view.tab === "Transaksi" ? <Transactions ctx={ctx} subtab={view.subtab ?? "Penerimaan Barang"} /> : null}
        {view.tab === "Riwayat" ? <HistoryPanel ctx={ctx} subtab={view.subtab ?? "Log Stok"} /> : null}
      </GuideTarget>

      {modal ? <InventoryModal ctx={ctx} /> : null}
    </PreviewPageRoot>
  );
}

function Summary({ ctx }: { ctx: PreviewContext }) {
  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-4 gap-4"><PreviewMetric label="Request Pending" value="12" icon={ClipboardList} tone="blue" /><PreviewMetric label="Stok Negatif" value="3" icon={LogOut} tone="amber" /><PreviewMetric label="Stok Habis / Rendah" value="8 / 21" icon={PackageOpen} tone="violet" /><PreviewMetric label="Approval Masuk" value="4" icon={ShieldCheck} tone="emerald" /></div>
      <GuideTarget ctx={ctx} target="inventory-input-menu" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-black">Tindak Lanjut Operasional</h2><p className="mt-1 text-xs text-slate-500">Angka aktual yang dapat langsung ditelusuri ke workflow terkait.</p>
        <div className="mt-4 grid grid-cols-4 gap-3">
          {ctx.state === "inventory-update-modal" ? <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white"><Plus className="h-4 w-4" />Update Stok</span> : <PreviewButton ctx={ctx} target="inventory-update-stock" icon={Plus} tone="brand">Update Stok</PreviewButton>}
          <PreviewButton ctx={ctx} target="inventory-inbound" icon={Truck}>Penerimaan Barang</PreviewButton>
          {ctx.state === "inventory-damaged-modal" ? <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2 text-xs font-bold"><AlertTriangle className="h-4 w-4" />Laporan Barang Rusak</span> : <PreviewButton ctx={ctx} target="inventory-damaged" icon={AlertTriangle}>Laporan Barang Rusak</PreviewButton>}
          {ctx.state === "inventory-weekly-proof-modal" ? <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2 text-xs font-bold"><ClipboardCheck className="h-4 w-4" />Proof Kebersihan</span> : <PreviewButton ctx={ctx} target="inventory-weekly-proof" icon={ClipboardCheck}>Proof Kebersihan</PreviewButton>}
        </div>
      </GuideTarget>
      <div className="grid grid-cols-[1.6fr_1fr] gap-4"><section className="h-72 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black">Volume Inbound vs Outbound (7 Hari)</h2><div className="mt-8 flex h-48 items-end gap-5 border-b border-l border-slate-200 px-6">{[60,110,85,140,92,155,125].map((h, i) => <div key={i} className="flex flex-1 items-end gap-1"><span className="w-1/2 rounded-t bg-violet-500" style={{height:h}} /><span className="w-1/2 rounded-t bg-rose-500" style={{height:h*.65}} /></div>)}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black">Kesehatan Gudang</h2>{['Akurasi Inventaris 96%','Ketersediaan Stok 91%','Rasio Fulfillment 88%'].map((row) => <div key={row} className="mt-5 rounded-xl bg-slate-50 p-4 text-sm font-bold">{row}</div>)}</section></div>
    </div>
  );
}

function Tasks({ ctx }: { ctx: PreviewContext }) {
  return <GuideTarget ctx={ctx} target="inventory-tasks" className="mt-5 grid grid-cols-[1fr_1.2fr] gap-4" data-help-active-subtab="Tugas Harian"><section className="rounded-2xl border bg-white p-5"><h2 className="font-black">Tugas Harian</h2>{['Matching Stok Harian','Laporan Barang Rusak','Verifikasi Log OUT'].map((task) => <div key={task} className="mt-3 flex justify-between rounded-xl border p-4 text-sm"><strong>{task}</strong><span className="text-amber-700">Belum selesai</span></div>)}</section><section className="rounded-2xl border bg-white p-5"><h2 className="font-black">Checklist Manual Harian</h2>{['Cek stok display','Rapikan area inbound','Foto rak prioritas'].map((task) => <p key={task} className="mt-3 rounded-xl bg-slate-50 p-4 text-sm">□ {task}</p>)}</section></GuideTarget>;
}

function Transactions({ ctx, subtab }: { ctx: PreviewContext; subtab: string }) {
  return <div className="mt-5" data-help-active-subtab={subtab}><div className="flex gap-2 rounded-2xl bg-slate-100 p-1.5">{['Penerimaan Barang','Pemakaian Internal','Surat Jalan'].map((tab) => <span key={tab} className={cx("rounded-xl px-5 py-2.5 text-sm font-bold", subtab === tab ? 'bg-white shadow-sm' : 'text-slate-500')}>{tab}</span>)}</div>{subtab === 'Surat Jalan' ? <GuideTarget ctx={ctx} target="inventory-surat-jalan" className="mt-4 rounded-2xl border bg-white p-5"><h2 className="font-black">Surat Jalan</h2><p className="mt-1 text-sm text-slate-500">Tandai status kirim, tanda tangan, dan catatan pengecualian.</p><div className="mt-4 grid grid-cols-4 bg-slate-50 p-3 text-xs font-bold"><span>No. Surat Jalan</span><span>Pelanggan</span><span>Status</span><span>Marking</span></div></GuideTarget> : <GuideTarget ctx={ctx} target="inventory-inbound" className="mt-4 rounded-2xl border bg-white p-5"><h2 className="font-black">Penerimaan Barang</h2><p className="mt-1 text-sm text-slate-500">Catat barang masuk dari supplier dan ajukan verifikasi.</p><div className="mt-4 grid grid-cols-3 gap-3"><PreviewField label="Supplier" value="CV Sumber Rezeki" /><PreviewField label="Nomor Dokumen" value="INB-20260710-004" /><PreviewField label="Tanggal" value="10 Juli 2026" /></div></GuideTarget>}</div>;
}

function HistoryPanel({ ctx, subtab }: { ctx: PreviewContext; subtab: string }) {
  return <div className="mt-5" data-help-active-subtab={subtab}><div className="flex gap-2 rounded-2xl bg-slate-100 p-1.5">{['Log Stok','Rekap Stok','Laporan Barang Rusak','Riwayat Tugas Harian','Riwayat Tugas Mingguan'].map((tab) => <span key={tab} className={cx("rounded-xl px-4 py-2.5 text-xs font-bold", subtab === tab ? 'bg-white shadow-sm' : 'text-slate-500')}>{tab}</span>)}</div><GuideTarget ctx={ctx} target="inventory-stock-log-tab" className="mt-4 overflow-hidden rounded-2xl border bg-white"><div className="grid grid-cols-[180px_240px_150px_170px_160px_180px] bg-slate-50 p-4 text-xs font-bold"><span>Waktu</span><span>Produk</span><span>Jenis</span><span>Perubahan</span><span>Status</span><span>Aksi</span></div>{['Kertas A4 80gsm','Tinta Epson Black','Art Carton A3'].map((name, index) => <div key={name} className="grid grid-cols-[180px_240px_150px_170px_160px_180px] border-t p-4 text-xs"><span>10 Jul · 08:{20+index}</span><strong>{name}</strong><span>{index === 1 ? 'OUT' : 'IN'}</span><span>{index === 1 ? '-2' : '+12'}</span>{index === 1 ? <GuideTarget ctx={ctx} target="inventory-out-log" className="font-bold text-amber-700">Belum diverifikasi</GuideTarget> : <span className="text-emerald-700">Terverifikasi</span>}<span className="flex gap-2">{index === 1 ? <><GuideTarget ctx={ctx} target="inventory-approval-actions" className="font-bold text-emerald-700">Setujui</GuideTarget><GuideTarget ctx={ctx} target="inventory-correction" className="font-bold text-brand-700">Koreksi</GuideTarget></> : 'Detail'}</span></div>)}</GuideTarget></div>;
}

function InventoryModal({ ctx }: { ctx: PreviewContext }) {
  const config = ctx.state === 'inventory-damaged-modal' ? ['inventory-damaged','Laporkan Barang Rusak'] : ctx.state === 'inventory-weekly-proof-modal' ? ['inventory-weekly-proof','Proof Kebersihan Gudang'] : ctx.state === 'inventory-matching-modal' ? ['inventory-matching','Matching Stok Harian'] : ['inventory-update-stock','Update Stok'];
  return <PreviewModal ctx={ctx} target={config[0]} title={config[1]} width="max-w-3xl"><div className="grid grid-cols-2 gap-4"><PreviewField label="Cari Produk" value="Kertas A4 80gsm" /><PreviewField label="Jumlah" value="12" /><div className="col-span-2"><PreviewField label="Catatan / Proof" value="Pemeriksaan gudang 10 Juli 2026" /></div></div><div className="mt-5 flex justify-end"><span className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white">Simpan</span></div></PreviewModal>;
}
