"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@pos/ui";
import { X } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import { GiroLinkChangedError, planGiroLink, postGiroLink, sameLinkPayment, type LinkGiroRecord, type LinkManualRecord } from "../helpers/giro-link";

type FieldsProps = {
  item: LinkGiroRecord;
  manualPayables: LinkManualRecord[];
  selectedPayableId: string | null;
  onSelectPayable: (value: string | null) => void;
  choices: Record<string, string>;
  onChoicesChange: (value: Record<string, string>) => void;
  historiesConfirmed: boolean;
  onHistoriesConfirmedChange: (value: boolean) => void;
  distinctConfirmed: boolean;
  onDistinctConfirmedChange: (value: boolean) => void;
};

const control = "mt-1 min-h-11 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-base text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

export function GiroLinkFields({ item, manualPayables, selectedPayableId, onSelectPayable, choices, onChoicesChange, historiesConfirmed, onHistoriesConfirmedChange, distinctConfirmed, onDistinctConfirmedChange }: FieldsProps) {
  const selected = manualPayables.find(value => value.id === selectedPayableId);
  const plan = selected ? planGiroLink(item, selected, choices) : null;
  return <>
    <p className="text-sm text-surface-700">Pilih hutang manual yang benar-benar merupakan giro ini. Periksa kedua catatan sebelum menghubungkan.</p>
    <section className="rounded-lg bg-surface-50 p-3 text-sm" aria-label="Riwayat pembayaran giro">
      <h3 className="font-semibold">Riwayat pembayaran giro</h3>
      <p>{item.number} · {item.supplierName} · {formatRupiah(item.amount)}</p>
      <p>Tanggal hutang {item.payableDebtDate ?? item.debtDate ?? "Belum tersedia"} · Jatuh tempo {item.dueDate ?? "Tidak dicatat"}</p>
      <p className="mt-1 whitespace-pre-wrap break-words">Catatan giro: {item.payableNote || "Tidak ada catatan"}</p>
      {item.payments.length ? <ol className="mt-2 list-inside list-decimal">{item.payments.map((payment, index) => <li key={payment.id ?? index}>{payment.paidAt} · {formatRupiah(payment.amount)}</li>)}</ol> : <p>Belum ada pembayaran tercatat.</p>}
    </section>
    <label className="block text-sm font-medium">Hutang manual yang akan dihubungkan
      <select autoFocus required className={control} value={selectedPayableId ?? ""} onChange={event => onSelectPayable(event.target.value || null)}>
        <option value="">Pilih hutang manual</option>
        {manualPayables.map(payable => <option key={payable.id} value={payable.id}>{payable.supplierName} · {formatRupiah(payable.amount)} · {payable.debtDate}</option>)}
      </select>
    </label>
    {selected && <section className="rounded-lg bg-surface-50 p-3 text-sm" aria-label="Riwayat pembayaran hutang manual">
      <h3 className="font-semibold">Riwayat pembayaran hutang manual</h3>
      <p>{selected.supplierName} · {formatRupiah(selected.amount)}</p>
      <p>Tanggal hutang {selected.debtDate} · Jatuh tempo {selected.dueDate ?? "Tidak dicatat"}</p>
      <p className="mt-1 whitespace-pre-wrap break-words">Catatan hutang manual: {selected.note || "Tidak ada catatan"}</p>
      {selected.payments.length ? <ol className="mt-2 space-y-3">{selected.payments.map((payment, index) => {
        const candidates = item.payments.map((row, giroIndex) => ({ row, giroIndex })).filter(({ row }) => row.id && sameLinkPayment(row, payment));
        return <li key={payment.id ?? index}>
          <p>Pembayaran manual {index + 1}: {payment.paidAt} · {formatRupiah(payment.amount)}</p>
          {candidates.length > 0 && payment.id && <label className="block font-medium">Periksa pembayaran manual {index + 1} yang tanggal dan nominalnya sama
            <select required className={control} value={choices[payment.id] ?? ""} onChange={event => onChoicesChange({ ...choices, [payment.id!]: event.target.value })}>
              <option value="">Pilih setelah memeriksa bukti</option>
              <option value="different">Pembayaran berbeda</option>
              {candidates.map(({ row, giroIndex }) => <option key={row.id} value={row.id}>Pembayaran yang sama dengan giro {giroIndex + 1} · {row.paidAt} · {formatRupiah(row.amount)}</option>)}
            </select>
          </label>}
        </li>;
      })}</ol> : <p>Belum ada pembayaran tercatat.</p>}
    </section>}
    {selected && <>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Pembayaran manual yang dipindah akan masuk arus kas giro pada tanggal aslinya. Periksa pengeluaran manual agar pembayaran yang sama tidak terhitung dua kali.</p>
      {plan?.issue ? <p role="alert" className="text-sm text-amber-800">{plan.issue}</p> : <p className="text-sm">Setelah dihubungkan: dibayar {formatRupiah(plan?.paid ?? 0)} · Sisa {formatRupiah(plan?.remaining ?? 0)}. Pembayaran yang dipilih sebagai sama hanya dihitung sekali.</p>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={historiesConfirmed} onChange={event => onHistoriesConfirmedChange(event.target.checked)} className="mt-1" /><span>Saya sudah memeriksa kedua hutang dan riwayat pembayarannya.</span></label>
      {plan?.requiresDistinctConfirmation && <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={distinctConfirmed} onChange={event => onDistinctConfirmedChange(event.target.checked)} className="mt-1" /><span>Saya telah memeriksa bukti dan memastikan pembayaran yang cocok tetapi tidak dipasangkan adalah transaksi berbeda.</span></label>}
    </>}
  </>;
}

export function GiroLinkDialog({ item, manualPayables, onClose, onSaved, onRefresh }: {
  item: LinkGiroRecord;
  manualPayables: LinkManualRecord[];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  onRefresh: () => Promise<{ items: LinkGiroRecord[]; manualPayables: LinkManualRecord[] }>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const active = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const titleId = useId();
  const [giro, setGiro] = useState(item);
  const [manuals, setManuals] = useState(manualPayables);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [distinctConfirmed, setDistinctConfirmed] = useState(false);
  const [stale, setStale] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = manuals.find(value => value.id === selectedId);
  const plan = selected ? planGiroLink(giro, selected, choices) : null;
  const canSubmit = Boolean(selected && plan?.valid && confirmed && (!plan.requiresDistinctConfirmation || distinctConfirmed) && !stale && !unavailable && !busy);

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    requestController.current = controller;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { active.current = false; controller.abort(); if (dialog?.open) dialog.close(); };
  }, []);

  async function refresh(reason?: string) {
    setStale(true); setConfirmed(false); setDistinctConfirmed(false); setChoices({});
    const withReason = (message: string) => [reason, message].filter(Boolean).join(" ");
    try {
      const latest = await onRefresh();
      if (!active.current) return;
      const next = latest.items.find(value => value.goodsPurchaseId === item.goodsPurchaseId);
      if (!next || next.payableId !== item.payableId || next.status === "UNKNOWN" || next.historyIssue) {
        setUnavailable(true);
        setError(withReason("Giro sudah berubah atau tidak tersedia. Tutup formulir dan periksa daftar terbaru."));
        return;
      }
      setGiro(next); setManuals(latest.manualPayables);
      setSelectedId(previous => previous && latest.manualPayables.some(value => value.id === previous) ? previous : null);
      setStale(false);
      setError(withReason("Data terbaru dimuat. Periksa kembali kedua catatan dan tentukan ulang pilihan pembayaran."));
    } catch {
      if (active.current) setError(withReason("Data terbaru belum dapat dimuat. Muat ulang sebelum menghubungkan hutang."));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !selected || submitting.current) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const scopedFetch: typeof fetch = (input, init) => active.current && requestController.current
        ? fetch(input, { ...init, signal: requestController.current.signal })
        : Promise.reject(new DOMException("Dialog ditutup.", "AbortError"));
      await postGiroLink(giro, selected, choices, confirmed, distinctConfirmed, scopedFetch);
      if (!active.current) return;
      try { await onSaved(); } finally { if (active.current) onClose(); }
    } catch (cause) {
      if (!active.current) return;
      setError(cause instanceof Error ? cause.message : "Hutang belum dapat dihubungkan.");
      if (cause instanceof GiroLinkChangedError) await refresh(cause.message);
    } finally { submitting.current = false; if (active.current) setBusy(false); }
  }

  return <dialog ref={dialogRef} aria-labelledby={titleId} onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overscroll-contain overflow-y-auto rounded-2xl border border-surface-200 bg-white p-0 text-surface-900 shadow-xl backdrop:bg-surface-950/45">
    <header className="flex items-center justify-between border-b border-surface-200 px-5 py-4"><h2 id={titleId} className="text-lg font-semibold">Hubungkan Hutang Manual</h2><button type="button" onClick={onClose} disabled={busy} aria-label="Tutup" className="rounded-lg p-2 text-surface-500 hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-brand-500"><X className="h-5 w-5" aria-hidden="true" /></button></header>
    <form onSubmit={event => void submit(event)} aria-busy={busy} className="space-y-4 p-5">
      <GiroLinkFields item={giro} manualPayables={manuals} selectedPayableId={selectedId} onSelectPayable={value => { setSelectedId(value); setChoices({}); setConfirmed(false); setDistinctConfirmed(false); }} choices={choices} onChoicesChange={value => { setChoices(value); setConfirmed(false); setDistinctConfirmed(false); }} historiesConfirmed={confirmed} onHistoriesConfirmedChange={setConfirmed} distinctConfirmed={distinctConfirmed} onDistinctConfirmedChange={setDistinctConfirmed} />
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {stale && !unavailable && <button type="button" disabled={busy} onClick={() => { setBusy(true); void refresh().finally(() => setBusy(false)); }} className="min-h-11 text-sm font-medium text-brand-700 underline">Muat ulang data</button>}
      <Button type="submit" loading={busy} disabled={!canSubmit} className="w-full">{busy ? "Menyimpan..." : "Hubungkan hutang"}</Button>
    </form>
  </dialog>;
}
