"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@pos/ui";
import { X } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import { useRole } from "@/components/providers/RoleProvider";
import { GiroPaymentError, giroPaymentStorageKey, postGiroPayment, readPendingGiroPayment, type GiroPaymentScope, type PendingGiroPayment, type StorageLike, type WithLock } from "../helpers/giro-payment-request";
import { jakartaToday } from "../helpers/supplier-payable-input";
import { GiroLinkDialog } from "./GiroLinkDialog";
export { planGiroLink, postGiroLink } from "../helpers/giro-link";
export { GiroLinkDialog, GiroLinkFields } from "./GiroLinkDialog";

type GiroPayment = { id?: string; amount: number; paidAt: string };
type Giro = {
  goodsPurchaseId: string;
  number: string;
  supplierName: string;
  amount: number;
  debtDate: string | null;
  payableDebtDate?: string | null;
  payableNote?: string | null;
  dueDate: string | null;
  payableId: string | null;
  status: "UNKNOWN" | "UNPAID" | "PARTIAL" | "PAID";
  historyIssue?: boolean;
  paid: number | null;
  remaining: number | null;
  payments: GiroPayment[];
  schedule?: { id: string; amount: number; dueDate: string; note: string | null }[];
};
type ManualPayable = { id: string; supplierName: string; amount: number; debtDate: string; dueDate: string | null; note?: string | null; paid: number; payments: GiroPayment[] };
type GiroData = { items: Giro[]; manualPayables: ManualPayable[] };
type DraftPayment = { amount: string; paidAt: string };
type PendingState = PendingGiroPayment | { error: string } | null;
class GiroHistoryChangedError extends Error { readonly code = "HistoryChanged"; }
const control = "mt-1 min-h-11 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-base text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

export function GiroAction({ item, canUpdate, pending, blocked = false, hasManualPayables = false, onReview, onPay, onLink }: { item: Giro; canUpdate: boolean; pending: boolean; blocked?: boolean; hasManualPayables?: boolean; onReview: () => void; onPay: () => void; onLink?: () => void }) {
  if (!canUpdate || blocked) return null;
  const className = "rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-surface-50 focus-visible:outline-2 focus-visible:outline-brand-500";
  if (pending) return <button type="button" onClick={onPay} className={className}>Pastikan pembayaran</button>;
  if (item.historyIssue) return null;
  if (item.status === "UNKNOWN") return <button type="button" onClick={onReview} className={className}>Periksa riwayat</button>;
  return <div className="flex flex-wrap gap-2">
    {item.status !== "PAID" && <button type="button" onClick={onPay} className={className}>Catat pembayaran</button>}
    {item.payableId && hasManualPayables && onLink && <button type="button" onClick={onLink} className={className}>Hubungkan hutang manual</button>}
  </div>;
}

const statusLabel: Record<Giro["status"], string> = {
  UNKNOWN: "Belum diketahui",
  UNPAID: "Belum lunas",
  PARTIAL: "Sebagian",
  PAID: "Lunas",
};

async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "Permintaan belum berhasil. Silakan coba lagi.");
  return data as T;
}

export async function saveGiro(mode: "review" | "payment", item: Giro, values: { amount: string; paidAt: string; payableId: string | null; payments: DraftPayment[]; expectedPayments?: GiroPayment[]; historyComplete: boolean; expectedBalance?: string }, fetcher: typeof fetch = fetch, storage?: StorageLike, scope?: GiroPaymentScope, withLock?: WithLock, signal?: AbortSignal) {
  if (mode === "payment" && !item.payableId) throw new Error("Hutang giro belum tersedia. Muat ulang daftar dan coba lagi.");
  if (mode === "payment") {
    if (!scope || scope.payableId !== item.payableId) throw new Error("Identitas pengguna atau toko belum tersedia. Muat ulang halaman dan coba lagi.");
    let target: StorageLike;
    try { target = storage ?? window.localStorage; }
    catch { throw new Error("Penyimpanan pembayaran tidak tersedia. Periksa pengaturan peramban."); }
    await postGiroPayment(target, scope, { amount: values.amount, paidAt: values.paidAt, expectedBalance: Object.hasOwn(values, "expectedBalance") ? values.expectedBalance : String(item.remaining ?? 0) }, fetcher, undefined, withLock, signal);
    return;
  }
  const url = `/api/finance/giro/${encodeURIComponent(item.goodsPurchaseId)}/reconcile`;
  const body = { historyComplete: values.historyComplete, payableId: values.payableId, payments: values.payments, expectedPayments: values.expectedPayments };
  const response = await fetcher(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null) as { code?: string; message?: string } | null;
  if (response.status === 409 && data?.code === "HistoryChanged") throw new GiroHistoryChangedError(data.message || "Riwayat pembayaran berubah.");
  if (!response.ok) throw new Error(data?.message || "Permintaan belum berhasil. Silakan coba lagi.");
}

export function GiroPaymentFields({ item, amount, onAmountChange, paidAt, onPaidAtChange, pending = false }: { item: Giro; amount: string; onAmountChange: (value: string) => void; paidAt: string; onPaidAtChange: (value: string) => void; pending?: boolean }) {
  return <>
    <p className="text-sm text-surface-700">{item.number} · {item.supplierName} · Sisa {formatRupiah(item.remaining ?? 0)}</p>
    {pending && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Pastikan pembayaran sebelumnya sebelum mencatat pembayaran lain.</p>}
    <label className="block text-sm font-medium">Nominal pembayaran (Rp)<input autoFocus name="amount" required type="number" min="0.01" max={pending ? undefined : item.remaining ?? 0} step="0.01" inputMode="decimal" readOnly={pending} value={amount} onChange={event => onAmountChange(event.target.value)} className={control} /></label>
    <label className="block text-sm font-medium">Tanggal pembayaran<input name="paidAt" required type="date" min={pending ? undefined : item.payableDebtDate ?? item.debtDate ?? undefined} max={pending ? undefined : jakartaToday()} readOnly={pending} value={paidAt} onChange={event => onPaidAtChange(event.target.value)} className={control} /></label>
  </>;
}

export function GiroReviewFields({ item, manualPayables, selectedPayableId, onSelectPayable, payments, onPaymentsChange, historyComplete, onHistoryCompleteChange }: {
  item: Giro; manualPayables: ManualPayable[]; selectedPayableId: string | null; onSelectPayable: (value: string | null) => void;
  payments: DraftPayment[]; onPaymentsChange: (value: DraftPayment[]) => void; historyComplete: boolean; onHistoryCompleteChange: (value: boolean) => void;
}) {
  const selected = manualPayables.find(payable => payable.id === selectedPayableId);
  const savedPayments = item.payableId ? item.payments : selected?.payments ?? [];
  const debtDate = item.payableId ? item.payableDebtDate ?? item.debtDate : selected && item.debtDate && selected.debtDate < item.debtDate ? selected.debtDate : item.debtDate;
  return <>
    <p className="text-sm text-surface-700">{item.number} · {item.supplierName} · Nominal {formatRupiah(item.amount)}</p>
    <p className="text-sm text-surface-600">Periksa seluruh pembayaran yang pernah dilakukan. Tambahkan yang belum tercatat sebelum mengonfirmasi.</p>
    {!item.payableId && <label className="block text-sm font-medium">Hutang yang sudah dicatat (opsional)
      <select name="payableId" value={selectedPayableId ?? ""} onChange={event => onSelectPayable(event.target.value || null)} className={control}>
        <option value="">Belum ada hutang yang sesuai</option>
        {selectedPayableId && !selected && <option value={selectedPayableId} disabled>Hutang terpilih tidak tersedia. Pilih kembali.</option>}
        {manualPayables.map(payable => <option key={payable.id} value={payable.id}>{payable.supplierName} · {formatRupiah(payable.amount)} · {payable.debtDate}</option>)}
      </select>
    </label>}
    {selected && Math.round(selected.amount * 100) !== Math.round(item.amount * 100) && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Nominal hutang harus sama dengan nominal giro. Pilih hutang lain atau periksa kembali catatannya.</p>}
    {(item.payableId || selected) && <div className="rounded-lg bg-surface-50 p-3 text-sm text-surface-700"><p className="font-semibold">Pembayaran yang sudah tercatat</p>{savedPayments.length ? <ul className="mt-1 space-y-1">{savedPayments.map((payment, index) => <li key={`${payment.paidAt}-${index}`}>{payment.paidAt} · {formatRupiah(payment.amount)}</li>)}</ul> : <p className="mt-1">Belum ada pembayaran tercatat.</p>}<p className="mt-2 text-xs">Jangan masukkan kembali pembayaran ini pada daftar tambahan.</p></div>}
    <fieldset className="space-y-3"><legend className="text-sm font-semibold">Pembayaran tambahan</legend>
      {payments.map((payment, index) => <div key={index} className="rounded-lg border border-surface-200 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Nominal pembayaran {index + 1} (Rp)<input name={`paymentAmount${index}`} required type="number" min="0.01" max={item.amount} step="0.01" inputMode="decimal" value={payment.amount} onChange={event => onPaymentsChange(payments.map((value, position) => position === index ? { ...value, amount: event.target.value } : value))} className={control} /></label>
          <label className="block text-sm font-medium">Tanggal pembayaran {index + 1}<input name={`paymentDate${index}`} required type="date" min={debtDate ?? undefined} max={jakartaToday()} value={payment.paidAt} onChange={event => onPaymentsChange(payments.map((value, position) => position === index ? { ...value, paidAt: event.target.value } : value))} className={control} /></label>
        </div>
        <button type="button" onClick={() => onPaymentsChange(payments.filter((_, position) => position !== index))} className="mt-2 min-h-11 text-sm font-medium text-red-700 underline">Hapus pembayaran {index + 1}</button>
      </div>)}
      <button type="button" onClick={() => onPaymentsChange([...payments, { amount: "", paidAt: jakartaToday() }])} className="min-h-11 rounded-lg border border-surface-300 px-3 text-sm font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">Tambahkan pembayaran sebelumnya</button>
    </fieldset>
    <label className="flex items-start gap-2 text-sm font-medium"><input name="historyComplete" type="checkbox" required checked={historyComplete} onChange={event => onHistoryCompleteChange(event.target.checked)} className="mt-1" />Saya memastikan riwayat pembayaran sudah lengkap</label>
  </>;
}

export function GiroDialog({ item, mode, manualPayables, scope, initialPending, onPendingChange, onClose, onSaved, onRefreshReview }: { item: Giro; mode: "review" | "payment"; manualPayables: ManualPayable[]; scope: GiroPaymentScope | null; initialPending: PendingGiroPayment | null; onPendingChange: (value: PendingState) => void; onClose: () => void; onSaved: () => Promise<unknown>; onRefreshReview: () => Promise<GiroData> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const active = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const titleId = useId();
  const [pending, setPending] = useState(initialPending);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [balanceStale, setBalanceStale] = useState(false);
  const [expectedBalance, setExpectedBalance] = useState<string | undefined>(initialPending ? initialPending.expectedBalance : String(item.remaining ?? 0));
  const [amount, setAmount] = useState(initialPending?.amount ?? "");
  const [paidAt, setPaidAt] = useState(initialPending?.paidAt ?? jakartaToday());
  const [payableId, setPayableId] = useState<string | null>(item.payableId);
  const [payments, setPayments] = useState<DraftPayment[]>([]);
  const [historyComplete, setHistoryComplete] = useState(false);
  const [reviewItem, setReviewItem] = useState(item);
  const [reviewPayables, setReviewPayables] = useState(manualPayables);
  const [reviewStale, setReviewStale] = useState(false);
  const [reviewUnavailable, setReviewUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    requestController.current = controller;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { active.current = false; controller.abort(); if (dialog?.open) dialog.close(); };
  }, []);

  async function refreshReview() {
    setReviewStale(true); setHistoryComplete(false);
    try {
      const latest = await onRefreshReview();
      if (!active.current) return;
      const latestItem = latest.items.find(value => value.goodsPurchaseId === item.goodsPurchaseId);
      if (!latestItem || latestItem.status !== "UNKNOWN" || latestItem.historyIssue) {
        setReviewUnavailable(true);
        setError("Giro sudah berubah atau tidak tersedia. Tutup formulir dan periksa daftar giro. Masukan belum disimpan.");
        return;
      }
      setReviewItem(latestItem); setReviewPayables(latest.manualPayables); setReviewStale(false);
      setError("Riwayat pembayaran berubah. Periksa daftar terbaru dan konfirmasi kembali sebelum menyimpan.");
    } catch {
      if (active.current) setError("Riwayat terbaru belum dapat dimuat. Coba muat ulang sebelum menyimpan; masukan tetap tersimpan di formulir.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = reviewPayables.find(value => value.id === payableId);
    if (submitting.current || (mode === "payment" && !item.payableId) || (mode === "review" && (!historyComplete || reviewStale || reviewUnavailable || (!reviewItem.payableId && payableId && !selected)))) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const expectedPayments = reviewItem.payableId ? reviewItem.payments : selected?.payments;
      const scopedFetch: typeof fetch = (input, init) => active.current && requestController.current
        ? fetch(input, { ...init, signal: requestController.current.signal })
        : Promise.reject(new DOMException("Dialog ditutup.", "AbortError"));
      await saveGiro(mode, mode === "review" ? reviewItem : item, { amount, paidAt, payableId, payments, expectedPayments, historyComplete, expectedBalance }, scopedFetch, undefined, scope ?? undefined, undefined, requestController.current?.signal);
      if (!active.current) return;
      if (mode === "payment") onPendingChange(null);
      await onSaved();
      if (active.current) onClose();
    } catch (cause) {
      if (!active.current) return;
      setError(cause instanceof Error ? cause.message : "Data belum dapat disimpan. Silakan coba lagi.");
      if (mode === "review" && cause instanceof GiroHistoryChangedError) await refreshReview();
      if (active.current && mode === "payment" && scope) {
        try {
          const next = readPendingGiroPayment(window.localStorage, scope);
          setPending(next); onPendingChange(next);
          if (next) { setAmount(next.amount); setPaidAt(next.paidAt); setExpectedBalance(next.expectedBalance); }
        } catch (storageCause) {
          const message = storageCause instanceof Error ? storageCause.message : "Penyimpanan pembayaran tidak tersedia.";
          setStorageError(message); onPendingChange({ error: message });
        }
        if (cause instanceof GiroPaymentError) {
          setBalanceStale(true);
          await onSaved();
        }
      }
    } finally { submitting.current = false; if (active.current) setBusy(false); }
  }

  return <dialog ref={dialogRef} aria-labelledby={titleId} onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-surface-200 bg-white p-0 text-surface-900 shadow-xl backdrop:bg-surface-950/45">
    <header className="flex items-center justify-between border-b border-surface-200 px-5 py-4"><h2 id={titleId} className="text-lg font-semibold">{mode === "review" ? "Periksa Riwayat Giro" : "Catat Pembayaran Giro"}</h2><button type="button" onClick={onClose} disabled={busy} aria-label="Tutup" className="rounded-lg p-2 text-surface-500 hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-brand-500"><X className="h-5 w-5" aria-hidden="true" /></button></header>
    <form onSubmit={event => void submit(event)} className="space-y-4 p-5" aria-busy={busy}>
      {mode === "review" ? <GiroReviewFields item={reviewItem} manualPayables={reviewPayables} selectedPayableId={payableId} onSelectPayable={value => { setPayableId(value); setHistoryComplete(false); }} payments={payments} onPaymentsChange={setPayments} historyComplete={historyComplete} onHistoryCompleteChange={setHistoryComplete} /> : <GiroPaymentFields item={item} amount={amount} onAmountChange={setAmount} paidAt={paidAt} onPaidAtChange={setPaidAt} pending={Boolean(pending)} />}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {storageError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{storageError}</p>}
      {balanceStale && <p className="text-sm text-surface-700">Tutup formulir dan periksa saldo terbaru sebelum melanjutkan.</p>}
      {mode === "review" && reviewStale && !reviewUnavailable && <button type="button" disabled={busy} onClick={() => { setBusy(true); void refreshReview().finally(() => setBusy(false)); }} className="min-h-11 text-sm font-medium text-brand-700 underline">Muat ulang riwayat</button>}
      <Button type="submit" loading={busy} disabled={busy || Boolean(storageError) || balanceStale || (mode === "review" && (reviewStale || reviewUnavailable || Boolean(!reviewItem.payableId && payableId && !reviewPayables.some(value => value.id === payableId))))} className="w-full">{busy ? "Menyimpan..." : mode === "review" ? "Simpan hasil pemeriksaan" : pending ? "Pastikan pembayaran" : "Simpan pembayaran"}</Button>
    </form>
  </dialog>;
}

export function GiroPanel({ canUpdate }: { canUpdate: boolean }) {
  const { userId, storeId, authorizationFingerprint } = useRole();
  const identity = JSON.stringify([userId, storeId, authorizationFingerprint, canUpdate]);
  return <GiroPanelState key={identity} canUpdate={canUpdate} />;
}

function GiroPanelState({ canUpdate }: { canUpdate: boolean }) {
  const queryClient = useQueryClient();
  const { userId, storeId, authorizationFingerprint } = useRole();
  const [selection, setSelection] = useState<{ item: Giro; mode: "review" | "payment" } | null>(null);
  const [linkItem, setLinkItem] = useState<Giro | null>(null);
  const [pendingById, setPendingById] = useState<Record<string, PendingState>>({});
  const list = useQuery({
    queryKey: ["finance", "giro", storeId, userId, authorizationFingerprint],
    enabled: Boolean(storeId && userId),
    queryFn: async () => responseJson<GiroData>(await fetch("/api/finance/giro", { cache: "no-store" })),
  });
  const items = list.data?.items;

  useEffect(() => {
    if (!items || !storeId || !userId) return;
    const next: Record<string, PendingState> = {};
    for (const item of items) {
      if (!item.payableId) continue;
      try { next[item.payableId] = readPendingGiroPayment(window.localStorage, { storeId, userId, payableId: item.payableId }); }
      catch (cause) { next[item.payableId] = { error: cause instanceof Error ? cause.message : "Penyimpanan pembayaran tidak tersedia." }; }
    }
    setPendingById(next);
  }, [items, storeId, userId]);

  useEffect(() => {
    if (!items || !storeId || !userId) return;
    const onStorage = (event: StorageEvent) => {
      for (const item of items) {
        if (!item.payableId) continue;
        const scope = { storeId, userId, payableId: item.payableId };
        if (event.key !== giroPaymentStorageKey(scope) && event.key !== null) continue;
        try { setPendingById(current => ({ ...current, [item.payableId!]: readPendingGiroPayment(window.localStorage, scope) })); }
        catch (cause) { setPendingById(current => ({ ...current, [item.payableId!]: { error: cause instanceof Error ? cause.message : "Penyimpanan pembayaran tidak tersedia." } })); }
        void queryClient.invalidateQueries({ queryKey: ["finance", "giro"] });
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [items, storeId, userId, queryClient]);

  function openPayment(item: Giro) {
    if (!item.payableId || !storeId || !userId) return;
    try {
      const saved = readPendingGiroPayment(window.localStorage, { storeId, userId, payableId: item.payableId });
      setPendingById(current => ({ ...current, [item.payableId!]: saved }));
      setSelection({ item, mode: "payment" });
    } catch (cause) {
      setPendingById(current => ({ ...current, [item.payableId!]: { error: cause instanceof Error ? cause.message : "Penyimpanan pembayaran tidak tersedia." } }));
    }
  }

  return (
    <section aria-labelledby="giro-title" className="mt-5 border-t border-surface-200 pt-5">
      <h2 id="giro-title" className="text-sm font-semibold text-surface-900">Giro Pembelian</h2>
      <p className="mt-1 text-xs text-surface-600">Periksa riwayat dan catat pembayaran giro agar saldo dan arus kas sesuai.</p>
      {list.isLoading ? <p className="mt-4 text-sm text-surface-500" role="status">Memuat giro...</p> : list.isError ? <p className="mt-4 text-sm text-red-700" role="alert">Giro belum dapat dimuat. <button type="button" onClick={() => void list.refetch()} className="underline">Coba lagi</button></p> : !list.data?.items.length ? <p className="mt-4 text-sm text-surface-500">Belum ada giro pembelian.</p> : (
        <ul className="mt-3 divide-y divide-surface-100">
          {list.data.items.map(item => {
            const saved = item.payableId ? pendingById[item.payableId] : null;
            const pending = saved && "key" in saved ? saved : null;
            const storageError = saved && "error" in saved ? saved.error : null;
            return (
            <li key={item.goodsPurchaseId} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                <p className="break-words font-semibold text-surface-900">{item.number} · {item.supplierName}</p>
                <p className="mt-1 text-xs text-surface-600">Nominal {formatRupiah(item.amount)} · Jatuh tempo {item.dueDate ?? "Belum tersedia"}</p>
                {Boolean(item.schedule?.length) && <div className="mt-2 text-xs text-surface-600">
                  <p className="font-semibold">Jadwal giro</p>
                  <ul className="mt-1 space-y-1">{item.schedule?.map((giro, index) => <li key={giro.id}>
                    Giro {index + 1}: {formatRupiah(giro.amount)} · {giro.dueDate}{giro.note ? ` · ${giro.note}` : ""}
                  </li>)}</ul>
                </div>}
                {!item.debtDate && <p className="mt-1 text-xs text-red-700">Tanggal kewajiban belum tersedia.</p>}
                <p className="mt-1 text-xs text-surface-600">{statusLabel[item.status]}{item.remaining !== null ? ` · Sisa ${formatRupiah(item.remaining)}` : " · Sisa belum diketahui"}</p>
                {item.historyIssue && <p className="mt-1 text-xs text-red-700">Riwayat pembayaran tidak sesuai. Hubungi pengelola untuk memeriksa data giro ini.</p>}
                {storageError && <p role="alert" className="mt-1 text-xs text-red-700">{storageError}</p>}
                {item.status !== "UNKNOWN" && item.payments.length > 0 && <details className="mt-2 text-xs text-surface-600"><summary className="cursor-pointer">Riwayat pembayaran</summary><ul className="mt-1 space-y-1">{item.payments.map((payment, index) => <li key={`${payment.paidAt}-${index}`}>{payment.paidAt} · {formatRupiah(payment.amount)}</li>)}</ul></details>}
              </div>
              <GiroAction item={item} canUpdate={canUpdate} pending={Boolean(pending)} blocked={Boolean(storageError) || !storeId || !userId} hasManualPayables={Boolean(list.data?.manualPayables.length)} onReview={() => setSelection({ item, mode: "review" })} onPay={() => openPayment(item)} onLink={() => setLinkItem(item)} />
            </li>
          ); })}
        </ul>
      )}
      {selection && <GiroDialog item={selection.item} mode={selection.mode} scope={storeId && userId && selection.item.payableId ? { storeId, userId, payableId: selection.item.payableId } : null} manualPayables={list.data?.manualPayables ?? []} initialPending={selection.item.payableId && pendingById[selection.item.payableId] && "key" in pendingById[selection.item.payableId]! ? pendingById[selection.item.payableId] as PendingGiroPayment : null} onPendingChange={value => { if (selection.item.payableId) setPendingById(current => ({ ...current, [selection.item.payableId!]: value })); }} onClose={() => setSelection(null)} onSaved={() => queryClient.invalidateQueries({ queryKey: ["finance"] })} onRefreshReview={async () => { const result = await list.refetch(); if (result.isError || !result.data) throw new Error("Gagal memuat giro"); return result.data; }} />}
      {linkItem && <GiroLinkDialog item={linkItem} manualPayables={list.data?.manualPayables ?? []} onClose={() => setLinkItem(null)} onSaved={() => queryClient.invalidateQueries({ queryKey: ["finance"] })} onRefresh={async () => { const result = await list.refetch(); if (result.isError || !result.data) throw new Error("Gagal memuat giro"); return result.data; }} />}
    </section>
  );
}
