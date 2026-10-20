import { ArrowDown, ArrowRight, Check, FileText, FolderInput, History, Layers, Package, ReceiptText } from "lucide-react";
import type { ChangeVisual } from "../types";

export function ChangeIllustration({ visual, compact = false }: { visual: ChangeVisual; compact?: boolean }) {
  const panel = "rounded-2xl border border-surface-200 bg-white p-4 shadow-sm sm:p-5";
  const icon = "h-5 w-5 text-brand-600";

  if (compact) {
    const previews = {
      tax: { Icon: ReceiptText, title: "Subtotal + pajak", detail: "Total nota tetap tersimpan" },
      categories: { Icon: FolderInput, title: "Pilih banyak. Pindah sekali.", detail: "Rapikan kategori bersama" },
      units: { Icon: Package, title: "Stok, satuan, konversi.", detail: "Langsung terlihat di kartu produk" },
      quotation: { Icon: FileText, title: "Penawaran sesuai kebutuhan.", detail: "Nomor pilihan Anda · Tanggal WIB" },
      "stock-groups": { Icon: Layers, title: "Satu grup, stok bersama.", detail: "Buat · Tinjau · Simpan" },
      changelog: { Icon: History, title: "Terus berkembang.", detail: "Lihat yang baru, langsung coba." },
      printing: { Icon: FileText, title: "Nota Percetakan langsung.", detail: "Pilih jenis · Isi nota · Bayar / DP" },
    };
    const preview = previews[visual];
    return <div className="relative flex min-h-36 items-center gap-4 bg-brand-50 px-5 pb-5 pt-9 sm:min-h-44 sm:px-7"><span className="absolute left-5 top-3 text-[11px] font-medium text-brand-800">Ilustrasi fitur</span><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-brand-100 bg-white"><preview.Icon className="h-7 w-7 text-brand-600" aria-hidden="true" /></span><div><p className="text-base font-extrabold leading-tight tracking-tight text-brand-950 sm:text-xl">{preview.title}</p><p className="mt-2 text-xs text-brand-800">{preview.detail}</p></div></div>;
  }

  return (
    <div className="relative flex min-h-64 flex-col justify-center overflow-hidden bg-brand-50 px-5 py-9 sm:min-h-72 sm:px-9">
      <span className="absolute left-5 top-4 text-[11px] font-semibold text-brand-800">Ilustrasi fitur</span>
      {visual === "printing" && (
        <div className="mx-auto w-full max-w-lg space-y-4">
          <div className="flex flex-wrap gap-2">{["SPANDUK", "PERCETAKAN", "PLAT", "STEMPEL", "PRINT"].map((label, index) => <span key={label} className={`rounded-lg px-2.5 py-2 text-[10px] font-bold ${index === 0 ? "bg-brand-600 text-white" : "border border-brand-200 bg-white text-brand-900"}`}>{label}</span>)}</div>
          <div className={panel}>
            <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><FileText className={icon} aria-hidden="true" /><span className="text-sm font-bold text-surface-900">Buat Nota Kosong</span></div><span className="text-xs font-semibold text-emerald-700">Tersimpan</span></div>
            <div className="mt-4 overflow-hidden rounded-lg border border-surface-200 text-xs"><div className="grid grid-cols-3 gap-2 bg-surface-50 px-3 py-2 font-semibold text-surface-500"><span>Nama file / item</span><span>Bahan</span><span>Jumlah</span></div><div className="h-8 border-t border-surface-100" /><div className="h-8 border-t border-surface-100" /></div>
            <div className="mt-4 flex justify-end"><span className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white">Bayar / DP</span></div>
          </div>
          <p className="text-center text-xs text-brand-800">Satu nota, satu transaksi. Temukan lagi di Riwayat.</p>
        </div>
      )}
      {visual === "tax" && (
        <div className="mx-auto w-full max-w-xs rounded-t-2xl border border-surface-200 bg-white p-6 shadow-sm">
          <ReceiptText className="mb-5 h-7 w-7 text-brand-600" aria-hidden="true" />
          <div className="flex items-center justify-between border-b border-dashed border-surface-200 pb-3 text-sm text-surface-600"><span>Subtotal</span><span>Harga belanja</span></div>
          <div className="my-3 flex items-center justify-between text-sm font-semibold text-brand-800"><span>+ Pajak</span><Check className="h-4 w-4" aria-hidden="true" /></div>
          <div className="flex items-center justify-between border-t border-surface-200 pt-3 font-bold text-surface-900"><span>Total nota</span><span>Tersimpan</span></div>
          <p className="mt-5 text-xs text-surface-500">Cetak pertama & cetak ulang</p>
        </div>
      )}
      {visual === "categories" && (
        <div className="mx-auto flex w-full max-w-lg items-center gap-3 sm:gap-5">
          <div className="flex-1 space-y-2">
            {["Produk A", "Produk B", "Produk C"].map(label => <div key={label} className="flex items-center gap-2 rounded-xl border border-surface-200 bg-white px-3 py-3 text-xs font-semibold text-surface-800 sm:text-sm"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white"><Check className="h-3 w-3" aria-hidden="true" /></span>{label}</div>)}
          </div>
          <ArrowRight className="h-6 w-6 shrink-0 text-brand-600" aria-hidden="true" />
          <div className={`${panel} flex-1 text-center`}><FolderInput className="mx-auto mb-3 h-9 w-9 text-brand-600" aria-hidden="true" /><p className="text-sm font-bold text-surface-900">Kategori tujuan</p><p className="mt-1 text-xs text-surface-500">Satu kali pemindahan</p></div>
        </div>
      )}
      {visual === "units" && (
        <div className="mx-auto w-full max-w-sm">
          <div className={panel}><div className="flex items-center gap-3"><Package className={icon} aria-hidden="true" /><span className="text-sm font-bold">Stok per satuan</span></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-brand-50 p-4"><span className="text-xs text-brand-800">Satuan pilihan</span><p className="mt-1 text-xl font-extrabold text-brand-900">Pak</p></div><div className="rounded-xl bg-surface-50 p-4"><span className="text-xs text-surface-600">Konversi ke</span><p className="mt-1 text-xl font-extrabold text-surface-900">Dus</p></div></div></div>
          <p className="mt-4 text-center text-xs font-medium text-brand-800">Satuan berubah, informasi stok ikut menyesuaikan.</p>
        </div>
      )}
      {visual === "quotation" && (
        <div className={`mx-auto w-full max-w-sm ${panel}`}>
          <div className="mb-5 flex items-center gap-3"><FileText className={icon} aria-hidden="true" /><span className="text-sm font-bold">Cetak penawaran</span></div>
          <div className="space-y-3"><div className="rounded-xl border border-surface-200 p-3"><p className="text-xs text-surface-500">Nomor penawaran</p><p className="mt-1 text-sm font-semibold text-surface-800">Sesuai kebutuhan Anda</p></div><div className="flex items-center justify-between rounded-xl bg-brand-50 p-3"><span className="text-sm text-brand-900">Tanggal otomatis</span><span className="text-xs font-bold text-brand-800">WIB</span></div></div>
        </div>
      )}
      {visual === "stock-groups" && (
        <div className="mx-auto w-full max-w-sm text-center"><div className={`${panel} inline-flex items-center gap-3`}><Layers className={icon} aria-hidden="true" /><span className="text-sm font-bold">Stok bersama</span></div><ArrowDown className="mx-auto my-3 h-6 w-6 text-brand-600" aria-hidden="true" /><div className="grid grid-cols-2 gap-3">{["Produk A", "Produk B"].map(label => <div key={label} className={panel}><Package className="mx-auto mb-2 h-6 w-6 text-brand-600" aria-hidden="true" /><span className="text-sm font-semibold">{label}</span></div>)}</div><p className="mt-4 text-xs font-medium text-brand-800">Satu grup, konversi tetap terlihat.</p></div>
      )}
      {visual === "changelog" && (
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 flex items-center gap-3"><History className="h-8 w-8 text-brand-700" aria-hidden="true" /><p className="text-xl font-extrabold tracking-tight text-brand-950">Terus berkembang.<br /><span className="font-medium text-brand-700">Tetap mudah diikuti.</span></p></div>
          <div className="space-y-3 border-l-2 border-brand-200 pl-5">{["Lihat yang baru", "Kenali tampilannya", "Ikuti langkahnya"].map((label, i) => <div key={label} className="relative flex items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-surface-800"><span className="absolute -left-[27px] h-2.5 w-2.5 rounded-full bg-brand-600 ring-4 ring-brand-50" /><span className="text-xs font-bold text-brand-700">0{i + 1}</span>{label}</div>)}</div>
        </div>
      )}
    </div>
  );
}
