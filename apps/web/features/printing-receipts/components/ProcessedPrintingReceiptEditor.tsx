"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@pos/ui";
import { AlertTriangle, Link2, Plus, Trash2, X } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import { calculateTransactionTax, getTransactionTaxMethod, getTransactionTaxRate } from "@/features/transaction-tax/helpers/tax-calculation";
import { readPrintingReceiptResponse } from "../receipt-api";
import type { ProcessedPrintingReceiptReview } from "../processed-edit";
import { MAX_PRINTING_RECEIPT_AMOUNT } from "../domain";
import type { PrintingReceipt, PrintingReceiptLine } from "../types";
import { PrintingReceiptView } from "./PrintingReceiptView";
import { PrintingReceiptStockLinkModal } from "./PrintingReceiptStockLinkModal";

type Phase = "warning" | "edit" | "review" | "discard";
const warning = "Menyimpan perubahan akan memperbarui transaksi, menyesuaikan stok/bahan yang terpakai, serta menghitung ulang total tagihan dan sisa piutang. Transaksi yang sebelumnya lunas dapat kembali memiliki piutang jika total tagihan bertambah.";
const emptyLine = (): PrintingReceiptLine => ({ id: crypto.randomUUID(), name: "", material: "", quantity: null, price: null, stockLink: null });

/** Processed corrections stay local until the reviewed, explicit commit succeeds. */
export function ProcessedPrintingReceiptEditor({ receipt, onClose, onSaved }: {
  receipt: PrintingReceipt;
  onClose: () => void;
  onSaved: (receipt: PrintingReceipt) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  const [draft, setDraft] = useState(receipt);
  const [phase, setPhase] = useState<Phase>("warning");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ProcessedPrintingReceiptReview | null>(null);
  const [stockLineId, setStockLineId] = useState<string | null>(null);
  const dirty = JSON.stringify(draft.document) !== JSON.stringify(receipt.document);
  const stockLine = draft.document.lines.find(line => line.id === stockLineId);
  const endpoint = `/api/printing-receipts/${encodeURIComponent(receipt.id)}/processed`;
  const transaction = receipt.transaction;
  const subtotal = draft.document.lines.reduce((sum, line) => sum + (line.price ?? 0) * (line.quantity ?? 0), 0);
  const previewSubtotal = Number.isFinite(subtotal) ? Math.min(MAX_PRINTING_RECEIPT_AMOUNT, Math.max(0, subtotal)) : MAX_PRINTING_RECEIPT_AMOUNT;
  const draftPayment = transaction ? {
    ...transaction,
    ...calculateTransactionTax({ subtotal: previewSubtotal, discount: transaction.discount, taxRate: getTransactionTaxRate(transaction), taxMethod: getTransactionTaxMethod(transaction) }),
    amountPaid: Math.max(0, transaction.amountPaid - transaction.change),
  } : undefined;

  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    element?.showModal();
    return () => { mounted.current = false; element?.close(); };
  }, []);
  useEffect(() => { heading.current?.focus(); }, [phase, stockLineId]);

  const close = () => {
    if (pending.current || stockLineId) return;
    if (phase !== "warning" && dirty) setPhase("discard");
    else onClose();
  };
  const change = (next: PrintingReceipt) => {
    setDraft({ ...next, number: receipt.number, transactionId: receipt.transactionId,
      document: { ...next.document, customerId: receipt.document.customerId } });
    setReview(null); setError(null);
  };
  const request = async (save: boolean) => {
    if (pending.current || !acknowledged || (save && !review)) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const response = await fetch(endpoint, { method: save ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: receipt.revision, number: receipt.number, document: draft.document,
          ...(save ? { acknowledged: true, reviewToken: review!.reviewToken } : {}) }) });
      if (save) {
        const saved = await readPrintingReceiptResponse<PrintingReceipt>(response);
        if (mounted.current) onSaved(saved);
      } else {
        const nextReview = await readPrintingReceiptResponse<ProcessedPrintingReceiptReview>(response);
        if (mounted.current) { setReview(nextReview); setPhase("review"); }
      }
    } catch (failure) {
      if (mounted.current) {
        setError(failure instanceof Error ? failure.message : "Perubahan belum tersimpan. Periksa kembali nota.");
        setReview(null); setPhase("edit");
      }
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  };

  return <dialog ref={dialog} aria-labelledby="processed-receipt-title" aria-describedby="processed-receipt-warning"
    onCancel={event => { event.preventDefault(); if (stockLineId) setStockLineId(null); else close(); }}
    className="m-auto max-h-[94dvh] w-[calc(100%-1rem)] max-w-6xl overflow-y-auto rounded-xl border border-red-200 bg-white p-0 shadow-xl backdrop:bg-black/50">
    <header className="flex items-center justify-between gap-3 border-b border-surface-200 px-4 py-3">
      <h2 ref={heading} id="processed-receipt-title" tabIndex={-1} className="text-lg font-bold text-surface-900 outline-none">Edit nota diproses</h2>
      <button type="button" aria-label="Tutup edit nota" disabled={busy} onClick={() => stockLineId ? setStockLineId(null) : close()} className="rounded p-2 text-surface-600 hover:bg-surface-100 focus-visible:ring-2 focus-visible:ring-danger-500"><X size={20} /></button>
    </header>
    <div className="space-y-4 p-4" hidden={Boolean(stockLine)}>
      <div id="processed-receipt-warning" className="rounded-lg border-2 border-red-500 bg-red-50 p-4 text-sm text-red-900">
        <p className="flex items-start gap-2 font-bold"><AlertTriangle aria-hidden="true" className="shrink-0" size={20} />PERINGATAN: Anda mengubah nota yang sudah diproses</p>
        <p className="mt-2">{warning}</p>
        <p className="mt-2">Pastikan perubahan sudah dikonfirmasi dengan pelanggan dan bagian produksi.</p>
        {phase !== "warning" && <p className="mt-2 font-semibold">Perubahan belum disimpan. Transaksi, stok, dan piutang baru diperbarui setelah Anda meninjau dan menyimpan.</p>}
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}
      {phase === "warning" && <>
        <p className="text-sm text-surface-700">Nota <strong>{receipt.number}</strong>. Pembayaran yang sudah tercatat tetap dipertahankan. Total baru di bawah pembayaran bersih akan ditolak; selisihnya harus diselesaikan melalui alur refund.</p>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-surface-300 p-3 text-sm font-semibold text-surface-800">
          <input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-red-700 focus-visible:ring-2 focus-visible:ring-danger-500" />
          Saya memahami dampaknya terhadap transaksi, stok, dan piutang.
        </label>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={onClose}>Batal</Button><Button variant="danger" disabled={!acknowledged} onClick={() => setPhase("edit")}>Tetap edit nota</Button></div>
      </>}
      {phase === "edit" && <>
        <Input label="Judul nota" value={draft.document.title ?? draft.number} maxLength={100} disabled={busy} onChange={event => change({ ...draft, document: { ...draft.document, title: event.target.value } })} />
        <p className="text-xs text-surface-600">Nomor nota dan identitas pelanggan terkait pembayaran tetap dipertahankan. Nama yang tercetak masih bisa dikoreksi.</p>
        <div className="max-h-[55dvh] overflow-auto rounded-lg border border-surface-200 bg-surface-100" aria-label="Lembar koreksi nota">
          <PrintingReceiptView receipt={draft} transaction={draftPayment} editable={!busy} allowProcessedEdit onChange={change} />
        </div>
        <details className="rounded-lg border border-surface-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-surface-800">Baris dan pemakaian bahan</summary>
          <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
            {draft.document.lines.map((line, index) => <div className="flex min-w-0 flex-wrap items-center gap-2 rounded border border-surface-200 p-2 text-xs" key={line.id}>
              <span className="min-w-0 flex-1 break-words">{index + 1}. {line.name || "Baris kosong"}</span>
              <button type="button" disabled={busy} onClick={() => setStockLineId(line.id)} className="flex items-center gap-1 rounded px-2 py-1.5 font-semibold text-brand-700 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500"><Link2 size={14} />{line.stockLink ? `${line.stockLink.quantity} ${line.stockLink.unit}` : "Hubungkan stok"}</button>
              <button type="button" disabled={busy} aria-label={`Hapus baris koreksi ${index + 1}`} onClick={() => change({ ...draft, document: { ...draft.document, lines: draft.document.lines.filter(item => item.id !== line.id) } })} className="rounded p-2 text-danger-700 hover:bg-danger-50 focus-visible:ring-2 focus-visible:ring-danger-500"><Trash2 size={14} /></button>
            </div>)}
          </div>
          <Button className="mt-3" variant="secondary" size="sm" disabled={busy || draft.document.lines.length >= 200} onClick={() => change({ ...draft, document: { ...draft.document, lines: [...draft.document.lines, emptyLine()] } })}><Plus size={14} />Tambah baris</Button>
        </details>
        {draft.subcategory !== "SPANDUK" && <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Keterangan pesanan" disabled={busy} value={draft.document.note} onChange={event => change({ ...draft, document: { ...draft.document, note: event.target.value } })} />
          <Input label="Janji selesai" type="date" disabled={busy} value={draft.document.completionDate} onChange={event => change({ ...draft, document: { ...draft.document, completionDate: event.target.value } })} />
        </div>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={close}>Batal edit</Button><Button disabled={!dirty} loading={busy} onClick={() => void request(false)}>Tinjau perubahan</Button></div>
      </>}
      {phase === "review" && review && <>
        <h3 className="font-bold text-surface-900">Tinjau perubahan · {receipt.number}</h3>
        <div className="overflow-x-auto rounded-lg border border-surface-200">
          <table className="w-full text-left text-sm"><caption className="sr-only">Nilai transaksi sebelum dan sesudah koreksi</caption>
            <thead className="bg-surface-50"><tr><th scope="col" className="p-3">Rincian</th><th scope="col" className="p-3">Sebelum</th><th scope="col" className="p-3">Sesudah</th></tr></thead>
            <tbody>{([["Subtotal", "subtotal"], ["Total tagihan", "total"], ["Pembayaran bersih", "paid"], ["Sisa piutang", "debt"]] as const).map(([label, key]) => <tr className="border-t border-surface-200" key={key}><th scope="row" className="p-3 font-medium">{label}</th><td className="whitespace-nowrap p-3">{formatRupiah(review.before[key])}</td><td className="whitespace-nowrap p-3 font-semibold">{formatRupiah(review.after[key])}</td></tr>)}</tbody>
          </table>
        </div>
        {review.after.status === "PENDING_APPROVAL" && <p className="text-sm text-surface-700">Transaksi tetap menunggu persetujuan. Stok dan piutang belum dibukukan sampai disetujui.</p>}
        {review.before.status === "COMPLETED" && review.after.debt > 0 && <p className="font-semibold text-red-800">Transaksi yang sebelumnya lunas akan kembali memiliki piutang.</p>}
        <div className="space-y-2 text-sm text-surface-700"><h4 className="font-semibold text-surface-900">Pemakaian bahan sebelum → sesudah</h4>
          {review.materials.length ? review.materials.map(material => <p className="break-words" key={material.productId}>{material.name}: {material.before} → <strong>{material.after}</strong> {material.unit}</p>) : <p>Tidak ada bahan yang terhubung ke stok.</p>}
        </div>
        <p className="text-sm text-surface-600">Pajak dan diskon mengikuti ketentuan transaksi tersimpan. Pembayaran bersih memperhitungkan kembalian yang sudah diberikan.</p>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => { setReview(null); setPhase("edit"); }}>Kembali mengedit</Button><Button variant="danger" loading={busy} onClick={() => void request(true)}>Simpan dan perbarui transaksi</Button></div>
      </>}
      {phase === "discard" && <>
        <h3 className="font-bold text-surface-900">Buang perubahan yang belum disimpan?</h3>
        <p className="text-sm text-surface-700">Isian koreksi akan dibuang. Nota dan transaksi tersimpan tetap memakai versi sebelumnya.</p>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={() => setPhase("edit")}>Lanjut mengedit</Button><Button variant="danger" onClick={onClose}>Buang perubahan</Button></div>
      </>}
    </div>
    {stockLine && <PrintingReceiptStockLinkModal inline key={stockLine.id} line={stockLine} onClose={() => setStockLineId(null)} onSave={stockLink => { change({ ...draft, document: { ...draft.document, lines: draft.document.lines.map(line => line.id === stockLine.id ? { ...line, stockLink } : line) } }); setStockLineId(null); }} />}
  </dialog>;
}
