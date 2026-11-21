"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw, X } from "lucide-react";
import type { previewTransactionUnvoid } from "@/features/transactions-stock/services/transaction-unvoid-service";
import { invalidateUnvoidViews } from "@/features/transaction-history/helpers/invalidate";

type Preview = Awaited<ReturnType<typeof previewTransactionUnvoid>>;
const rupiah = (amount: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
const statusLabel: Record<string, string> = { DRAFT: "Draft", PENDING_APPROVAL: "Menunggu persetujuan", COMPLETED: "Selesai", DP: "DP", CONFIRMED: "Dikonfirmasi", PENDING: "Menunggu" };

export function UnvoidPreviewContent({ preview }: { preview: Preview }) {
  return <div className="space-y-4 text-sm text-surface-700">
    <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
      <div className="text-xs font-semibold text-brand-700">Transaksi yang dipulihkan</div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><strong className="text-surface-900">{preview.invoiceNumber ?? "Draft transaksi"}</strong><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-brand-700">{statusLabel[preview.previousStatus] ?? preview.previousStatus}</span></div>
    </div>
    <section aria-labelledby="restore-stock-heading" className="space-y-2">
      <h3 id="restore-stock-heading" className="font-bold text-surface-900">Stok yang dikurangi kembali</h3>
      {preview.stock.length ? <ul className="divide-y divide-surface-100 rounded-xl border border-surface-200">{preview.stock.map((item) => <li key={`${item.productId}-${item.stockGroupId ?? ""}`} className="flex justify-between gap-4 px-3 py-2"><span>{item.name}</span><strong className="shrink-0">{item.amount} {item.unit}</strong></li>)}</ul> : <p className="text-surface-500">Tidak ada perubahan stok.</p>}
    </section>
    <section aria-labelledby="restore-shipment-heading" className="space-y-2">
      <h3 id="restore-shipment-heading" className="font-bold text-surface-900">Surat jalan</h3>
      {preview.shipments.length ? <ul className="divide-y divide-surface-100 rounded-xl border border-surface-200">{preview.shipments.map((item) => <li key={item.id} className="flex justify-between gap-4 px-3 py-2"><span>{item.number}</span><span>{statusLabel[item.status] ?? item.status}</span></li>)}</ul> : <p className="text-surface-500">Tidak ada surat jalan yang dipulihkan.</p>}
    </section>
    <section aria-labelledby="restore-customer-heading" className="space-y-2">
      <h3 id="restore-customer-heading" className="font-bold text-surface-900">Perhitungan pelanggan</h3>
      {preview.financialReversal ? <div className="rounded-xl border border-surface-200 px-3 py-2 space-y-1"><div className="flex justify-between gap-4"><span>Total pembayaran</span><strong>+{rupiah(preview.financialReversal.amountPaid)}</strong></div><div className="flex justify-between gap-4"><span>Piutang</span><strong>+{rupiah(preview.financialReversal.debtRemoved)}</strong></div><p className="text-xs text-surface-500">Jumlah pesanan pelanggan bertambah 1.</p></div> : <p className="text-surface-500">Tidak ada perubahan perhitungan pelanggan.</p>}
    </section>
  </div>;
}

export function UnvoidPreviewModal({ transactionId, onClose, onSuccess }: { transactionId: string; onClose: () => void; onSuccess: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(""); setPreview(null);
    try {
      const response = await fetch(`/api/transactions/${encodeURIComponent(transactionId)}/unvoid`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Pratinjau belum dapat dimuat.");
      setPreview(payload);
    } catch (err) { setError(err instanceof Error ? err.message : "Pratinjau belum dapat dimuat."); }
    finally { setLoading(false); }
  }, [transactionId]);
  useEffect(() => { dialog.current?.showModal(); cancelButton.current?.focus(); void load(); }, [load]);
  const restore = async () => {
    if (!preview || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/transactions/${encodeURIComponent(transactionId)}/unvoid`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ previewToken: preview.previewToken }) });
      const payload = await response.json();
      if (!response.ok) { setPreview(null); throw new Error(payload.message || "Transaksi belum dapat dipulihkan."); }
      invalidateUnvoidViews(queryClient, transactionId);
      onSuccess();
    } catch (err) { setError(err instanceof Error ? err.message : "Transaksi belum dapat dipulihkan."); }
    finally { setSaving(false); }
  };
  return <dialog ref={dialog} aria-labelledby="unvoid-title" onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-2xl border border-surface-100 bg-white p-0 text-surface-900 shadow-2xl backdrop:bg-black/40 open:flex open:flex-col">
    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-surface-100 px-5 py-4 sm:px-6">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-brand-50 p-2.5 text-brand-600"><RotateCcw className="h-5 w-5" aria-hidden="true" /></span><div><h2 id="unvoid-title" className="text-lg font-bold">Pratinjau pemulihan</h2><p className="text-xs text-surface-500">Periksa perubahan sebelum melanjutkan</p></div></div>
      <button type="button" onClick={onClose} disabled={saving} aria-label="Tutup" className="rounded-lg p-2 text-surface-500 hover:bg-surface-100"><X className="h-5 w-5" /></button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
      {loading && <p className="text-sm text-surface-500">Menyiapkan pratinjau…</p>}
      {error && <div role="alert" className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{error}</span></div>}
      {preview && <UnvoidPreviewContent preview={preview} />}
      {error && !saving && <button type="button" onClick={() => void load()} className="mt-3 text-sm font-semibold text-brand-700 underline">Muat ulang pratinjau</button>}
    </div>
    <div className="flex shrink-0 gap-3 border-t border-surface-100 px-5 py-4 sm:px-6"><button ref={cancelButton} type="button" disabled={saving} onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-surface-200 px-4 text-sm font-semibold text-surface-700">Batal</button><button type="button" disabled={!preview || loading || saving} onClick={() => void restore()} className="min-h-11 flex-1 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Memulihkan…" : "Pulihkan transaksi"}</button></div>
  </dialog>;
}
