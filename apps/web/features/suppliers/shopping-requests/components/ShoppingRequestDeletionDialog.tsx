"use client";

import { useEffect, useRef, useState } from "react";
import { useDeleteShoppingRequest, useShoppingRequestDeletionPreview } from "../hooks/useShoppingRequestDeletion";
import type { ShoppingRequestListItem } from "../types/shopping-request";

export function ShoppingRequestDeletionDialog({
  detail,
  onClose,
}: {
  detail: ShoppingRequestListItem;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const preview = useShoppingRequestDeletionPreview(detail.id);
  const deletion = useDeleteShoppingRequest();
  const canConfirmPreview = Boolean(preview.data) && !preview.isError && !preview.isFetching;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed || !canConfirmPreview || deletion.isPending) return;
    try {
      await deletion.mutateAsync({ id: detail.id, reason: trimmed });
      onClose();
    } catch {
      // The mutation exposes the error below and keeps the dialog open.
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="hapus-daftar-title"
      onCancel={(event) => { event.preventDefault(); if (!deletion.isPending) onClose(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl p-0 shadow-2xl backdrop:bg-black/50"
    >
      <form onSubmit={submit} className="space-y-4 p-5 sm:p-6">
        <div>
          <h2 id="hapus-daftar-title" className="text-lg font-bold text-slate-950">Hapus daftar belanja?</h2>
          <p className="mt-1 break-words text-sm text-slate-600"><strong>{detail.name}</strong> · {detail.number}</p>
        </div>
        <p className="text-sm text-slate-700">Daftar dan pembelian terkait akan dibatalkan dan tetap tersedia dalam riwayat. Stok dari penerimaan yang sudah disetujui akan dikurangi kembali.</p>
        <section aria-label="Dampak pada stok" className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          <h3 className="font-semibold">Stok yang akan dikurangi</h3>
          {preview.isPending ? <p className="mt-1" role="status">Memeriksa stok…</p> : preview.isError ? (
            <p className="mt-1 text-rose-700" role="alert">{preview.error instanceof Error ? preview.error.message : "Dampak stok belum dapat diperiksa."}</p>
          ) : preview.data?.movements.length ? (
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {preview.data.movements.map((movement) => <li key={`${movement.stockGroupId ?? "product"}:${movement.productId}`}>{movement.productName}: {new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(movement.baseQuantity)} {movement.unit ?? "satuan dasar"}</li>)}
            </ul>
          ) : <p className="mt-1">Tidak ada stok yang perlu dikurangi.</p>}
        </section>
        <p className="text-sm text-slate-700">Pengeluaran dan pembayaran yang sudah tercatat tetap ada di laporan. Pengembalian uang atau perubahan giro perlu dicatat melalui proses terpisah.</p>
        <p className="text-sm text-slate-700">HPP dan harga jual saat ini tidak diubah. Periksa kembali harga jika diperlukan.</p>
        <label className="block text-sm font-semibold text-slate-800" htmlFor="hapus-daftar-alasan">Alasan penghapusan</label>
        <textarea id="hapus-daftar-alasan" required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={deletion.isPending} className="min-h-24 w-full rounded-xl border border-slate-300 p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600" />
        {deletion.error && <p role="alert" className="text-sm text-rose-700">{deletion.error instanceof Error ? deletion.error.message : "Daftar belum berhasil dihapus."}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" autoFocus disabled={deletion.isPending} onClick={onClose} className="min-h-11 rounded-xl border border-slate-300 px-4 font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">Batal</button>
          <button type="submit" disabled={!reason.trim() || !canConfirmPreview || deletion.isPending} className="min-h-11 rounded-xl bg-rose-700 px-4 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50">{deletion.isPending ? "Menghapus…" : "Ya, hapus daftar"}</button>
        </div>
      </form>
    </dialog>
  );
}
