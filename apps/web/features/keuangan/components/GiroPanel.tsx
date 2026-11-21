"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@pos/ui";
import { Banknote, CalendarDays, ChevronDown, CircleAlert, CircleCheck, CircleDollarSign, CircleHelp, ClipboardCheck, Clock3, History, Info, Link2, ReceiptText, X } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import { useRole } from "@/components/providers/RoleProvider";
import { GIRO_PAYMENT_CHANGE_EVENT, GiroPaymentError, giroPaymentStorageKey, listPendingGiroPayments, postGiroPayment, readGiroPaymentGeneration, readPendingGiroPayment, type GiroPaymentScope, type PendingGiroPayment, type StorageLike, type WithLock } from "../helpers/giro-payment-request";
import { jakartaToday } from "../helpers/supplier-payable-input";
import { GiroLinkDialog } from "./GiroLinkDialog";
import { GiroSupplierCredit } from "./GiroSupplierCredit";
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
  ledgerVersion?: string | null;
  status: "UNKNOWN" | "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID";
  balanceIncludesOtherMethods?: boolean;
  historyIssue?: boolean;
  paid: number | null;
  creditApplied?: number;
  remaining: number | null;
  availableToPay?: number | null;
  futurePayments?: GiroPayment[];
  payments: GiroPayment[];
  schedule?: { id: string; amount: number; dueDate: string; note: string | null }[];
};
type ManualPayable = { id: string; supplierName: string; amount: number; debtDate: string; dueDate: string | null; note?: string | null; paid: number; payments: GiroPayment[] };
type GiroData = { items: Giro[]; manualPayables: ManualPayable[]; asOf?: string };
type DraftPayment = { amount: string; paidAt: string };
type PendingState = PendingGiroPayment | { error: string } | null;
class GiroHistoryChangedError extends Error { readonly code = "HistoryChanged"; }
const control = "mt-1 min-h-11 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-base text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

function giroMonthLabel(date: string | null, today: string): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00.000Z`))) return "Tanggal belum tersedia";
  const [year, month] = date.split("-").map(Number);
  const [currentYear, currentMonth] = today.split("-").map(Number);
  const difference = (year - currentYear) * 12 + month - currentMonth;
  if (difference === 0) return "Bulan ini";
  if (difference === 1) return "Bulan depan";
  if (difference === -1) return "Bulan lalu";
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`));
}

export function GiroAction({ item, canUpdate, pending, blocked = false, hasManualPayables = false, onReview, onPay, onLink }: { item: Giro; canUpdate: boolean; pending: boolean; blocked?: boolean; hasManualPayables?: boolean; onReview: () => void; onPay: () => void; onLink?: () => void }) {
  if (!canUpdate || blocked) return null;
  const buttonClass = "inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";
  const paymentClass = `${buttonClass} border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100`;
  const linkClass = `${buttonClass} border-surface-300 bg-white text-surface-700 hover:bg-surface-50`;
  if (pending) return <button type="button" onClick={onPay} className={paymentClass}><CircleCheck className="h-4 w-4" aria-hidden="true" />Pastikan pembayaran</button>;
  if (item.historyIssue) return null;
  if (item.status === "UNKNOWN") return <button type="button" onClick={onReview} className={paymentClass}><ClipboardCheck className="h-4 w-4" aria-hidden="true" />Periksa riwayat</button>;
  const canPay = item.remaining !== null && (item.availableToPay ?? item.remaining) > 0;
  const canLink = Boolean(item.payableId && hasManualPayables && onLink);
  if (!canPay && !canLink) return null;
  return <div className="flex flex-col gap-2">
    {canPay && <button type="button" onClick={onPay} className={paymentClass}><Banknote className="h-4 w-4" aria-hidden="true" />Catat pembayaran</button>}
    {canLink && <button type="button" onClick={onLink} className={linkClass}><Link2 className="h-4 w-4" aria-hidden="true" />Hubungkan hutang manual</button>}
  </div>;
}

const statusLabel: Record<Giro["status"], string> = {
  UNKNOWN: "Belum diketahui",
  UNPAID: "Belum lunas",
  PARTIAL: "Sebagian",
  PAID: "Lunas",
  OVERPAID: "Lebih bayar",
};

const statusBadgeTone: Record<Giro["status"], string> = {
  UNKNOWN: "border-surface-200 bg-surface-50 text-surface-600",
  UNPAID: "border-amber-200 bg-amber-50 text-amber-800",
  PARTIAL: "border-brand-200 bg-brand-50 text-brand-800",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-800",
  OVERPAID: "border-red-200 bg-red-50 text-red-800",
};

const statusRailTone: Record<Giro["status"], string> = {
  UNKNOWN: "bg-surface-300",
  UNPAID: "bg-amber-400",
  PARTIAL: "bg-brand-500",
  PAID: "bg-emerald-500",
  OVERPAID: "bg-red-500",
};

const statusIcons = {
  UNKNOWN: CircleHelp,
  UNPAID: Clock3,
  PARTIAL: CircleDollarSign,
  PAID: CircleCheck,
  OVERPAID: CircleAlert,
};

async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "Permintaan belum berhasil. Silakan coba lagi.");
  return data as T;
}

export async function saveGiro(mode: "review" | "payment", item: Giro, values: { amount: string; paidAt: string; payableId: string | null; payments: DraftPayment[]; expectedPayments?: GiroPayment[]; historyComplete: boolean; expectedBalance?: string; expectedLedgerVersion?: string; resource?: 'MANUAL' | 'GIRO'; expectedPendingKey?: string; expectedGeneration?: string | null }, fetcher: typeof fetch = fetch, storage?: StorageLike, scope?: GiroPaymentScope, withLock?: WithLock, signal?: AbortSignal) {
  if (mode === "payment" && !item.payableId) throw new Error("Hutang giro belum tersedia. Muat ulang daftar dan coba lagi.");
  if (mode === "payment") {
    if (!scope || scope.payableId !== item.payableId) throw new Error("Identitas pengguna atau toko belum tersedia. Muat ulang halaman dan coba lagi.");
    let target: StorageLike;
    try { target = storage ?? window.localStorage; }
    catch { throw new Error("Penyimpanan pembayaran tidak tersedia. Periksa pengaturan peramban."); }
    await postGiroPayment(target, scope, { amount: values.amount, paidAt: values.paidAt, expectedBalance: Object.hasOwn(values, "expectedBalance") ? values.expectedBalance : String(item.remaining ?? 0), expectedLedgerVersion: Object.hasOwn(values, "expectedLedgerVersion") ? values.expectedLedgerVersion : item.ledgerVersion ?? undefined, resource: values.resource }, fetcher, undefined, withLock, signal, values.expectedPendingKey, values.expectedGeneration);
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
    {Boolean(item.futurePayments?.length) && <p className="text-sm text-surface-600">Maksimal pembayaran baru {formatRupiah(item.availableToPay ?? 0)} setelah memperhitungkan pembayaran yang sudah tercatat untuk tanggal mendatang.</p>}
    {pending && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Pastikan pembayaran sebelumnya sebelum mencatat pembayaran lain.</p>}
    <label className="block text-sm font-medium">Nominal pembayaran (Rp)<input autoFocus name="amount" required type="number" min="0.01" max={pending ? undefined : item.availableToPay ?? item.remaining ?? 0} step="0.01" inputMode="decimal" readOnly={pending} value={amount} onChange={event => onAmountChange(event.target.value)} className={control} /></label>
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

export function GiroDialog({ item, mode, manualPayables, scope, initialPending, initialGeneration, onPendingChange, onClose, onSaved, onRefreshReview }: { item: Giro; mode: "review" | "payment"; manualPayables: ManualPayable[]; scope: GiroPaymentScope | null; initialPending: PendingGiroPayment | null; initialGeneration?: string | null; onPendingChange: (value: PendingState) => void; onClose: () => void; onSaved: () => Promise<unknown>; onRefreshReview: () => Promise<GiroData> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const active = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const titleId = useId();
  const [pending, setPending] = useState(initialPending);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [balanceStale, setBalanceStale] = useState(false);
  const [expectedBalance, setExpectedBalance] = useState<string | undefined>(initialPending ? initialPending.expectedBalance : String(item.remaining ?? 0));
  const [expectedLedgerVersion, setExpectedLedgerVersion] = useState<string | undefined>(initialPending ? initialPending.expectedLedgerVersion : item.ledgerVersion ?? undefined);
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
  const [applyingCredit, setApplyingCredit] = useState(false);
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
    if (submitting.current || applyingCredit || (mode === "payment" && !item.payableId) || (mode === "review" && (!historyComplete || reviewStale || reviewUnavailable || (!reviewItem.payableId && payableId && !selected)))) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const expectedPayments = reviewItem.payableId ? reviewItem.payments : selected?.payments;
      const scopedFetch: typeof fetch = (input, init) => active.current && requestController.current
        ? fetch(input, { ...init, signal: requestController.current.signal })
        : Promise.reject(new DOMException("Dialog ditutup.", "AbortError"));
      await saveGiro(mode, mode === "review" ? reviewItem : item, { amount, paidAt, payableId, payments, expectedPayments, historyComplete, expectedBalance, expectedLedgerVersion, resource: pending ? pending.resource : "GIRO", expectedPendingKey: pending?.key, expectedGeneration: initialGeneration }, scopedFetch, undefined, scope ?? undefined, undefined, requestController.current?.signal);
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
          if (next) { setAmount(next.amount); setPaidAt(next.paidAt); setExpectedBalance(next.expectedBalance); setExpectedLedgerVersion(next.expectedLedgerVersion); }
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

  return <dialog ref={dialogRef} aria-labelledby={titleId} onCancel={event => { if (busy || applyingCredit) event.preventDefault(); else onClose(); }} className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-surface-200 bg-white p-0 text-surface-900 shadow-xl backdrop:bg-surface-950/45">
    <header className="flex items-center justify-between border-b border-surface-200 px-5 py-4"><h2 id={titleId} className="text-lg font-semibold">{mode === "review" ? "Periksa Riwayat Giro" : "Catat Pembayaran Giro"}</h2><button type="button" onClick={onClose} disabled={busy || applyingCredit} aria-label="Tutup" className="rounded-lg p-2 text-surface-500 hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-brand-500"><X className="h-5 w-5" aria-hidden="true" /></button></header>
    <form onSubmit={event => void submit(event)} className="space-y-4 p-5" aria-busy={busy}>
      {mode === "review" ? <GiroReviewFields item={reviewItem} manualPayables={reviewPayables} selectedPayableId={payableId} onSelectPayable={value => { setPayableId(value); setHistoryComplete(false); }} payments={payments} onPaymentsChange={setPayments} historyComplete={historyComplete} onHistoryCompleteChange={setHistoryComplete} /> : <GiroPaymentFields item={item} amount={amount} onAmountChange={setAmount} paidAt={paidAt} onPaidAtChange={setPaidAt} pending={Boolean(pending)} />}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {storageError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{storageError}</p>}
      {balanceStale && <p className="text-sm text-surface-700">Tutup formulir dan periksa saldo terbaru sebelum melanjutkan.</p>}
      {mode === "review" && reviewStale && !reviewUnavailable && <button type="button" disabled={busy} onClick={() => { setBusy(true); void refreshReview().finally(() => setBusy(false)); }} className="min-h-11 text-sm font-medium text-brand-700 underline">Muat ulang riwayat</button>}
      <Button type="submit" loading={busy} disabled={busy || applyingCredit || Boolean(storageError) || balanceStale || (mode === "review" && (reviewStale || reviewUnavailable || Boolean(!reviewItem.payableId && payableId && !reviewPayables.some(value => value.id === payableId))))} className="w-full">{busy ? "Menyimpan..." : mode === "review" ? "Simpan hasil pemeriksaan" : pending ? "Pastikan pembayaran" : "Simpan pembayaran"}</Button>
    </form>
    {mode === "payment" && item.payableId && !pending && !balanceStale &&
      <GiroSupplierCredit payableId={item.payableId} control={control} disabled={busy} onBusy={setApplyingCredit}
        onApplied={async () => { await onSaved(); if (active.current) onClose(); }} />}
  </dialog>;
}

export function GiroPanel({ canUpdate, canLinkManual = false, legacyPaymentIds = [] }: { canUpdate: boolean; canLinkManual?: boolean; legacyPaymentIds?: string[] }) {
  const { userId, storeId, authorizationFingerprint } = useRole();
  const identity = JSON.stringify([userId, storeId, authorizationFingerprint, canUpdate, canLinkManual, legacyPaymentIds]);
  return <GiroPanelState key={identity} canUpdate={canUpdate} canLinkManual={canLinkManual} legacyPaymentIds={legacyPaymentIds} />;
}

function GiroPanelState({ canUpdate, canLinkManual, legacyPaymentIds }: { canUpdate: boolean; canLinkManual: boolean; legacyPaymentIds: string[] }) {
  const queryClient = useQueryClient();
  const { userId, storeId, authorizationFingerprint } = useRole();
  const [selection, setSelection] = useState<{ item: Giro; mode: "review" | "payment"; initialPending?: PendingGiroPayment | null; initialGeneration?: string | null } | null>(null);
  const [linkItem, setLinkItem] = useState<Giro | null>(null);
  const [pendingById, setPendingById] = useState<Record<string, PendingState>>({});
  const list = useQuery({
    queryKey: ["finance", "giro", storeId, userId, authorizationFingerprint],
    enabled: Boolean(storeId && userId),
    queryFn: async () => {
      let paymentGeneration: string | null | undefined;
      try { paymentGeneration = readGiroPaymentGeneration(window.localStorage, { storeId: storeId! }); } catch { paymentGeneration = undefined; }
      return { ...await responseJson<GiroData>(await fetch("/api/finance/giro", { cache: "no-store" })), paymentGeneration };
    },
  });
  const items = list.data?.items;
  const asOf = list.data?.asOf ?? jakartaToday();

  useEffect(() => {
    const nextMidnight = Date.parse(`${jakartaToday()}T17:00:00.000Z`);
    const timer = window.setTimeout(() => { void queryClient.invalidateQueries({ queryKey: ["finance", "giro"] }); }, Math.max(1000, nextMidnight - Date.now() + 250));
    return () => window.clearTimeout(timer);
  }, [list.data?.asOf, queryClient]);

  useEffect(() => {
    if (!items || !storeId || !userId) return;
    let next: Record<string, PendingState>;
    try { next = listPendingGiroPayments(window.localStorage, { storeId, userId }); }
    catch { next = {}; }
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
      try { setPendingById(listPendingGiroPayments(window.localStorage, { storeId, userId })); }
      catch { /* Individual items retain their existing storage error. */ }
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
    const onLocalChange = () => onStorage({ key: null } as StorageEvent);
    window.addEventListener(GIRO_PAYMENT_CHANGE_EVENT, onLocalChange);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(GIRO_PAYMENT_CHANGE_EVENT, onLocalChange); };
  }, [items, storeId, userId, queryClient]);

  function openPayment(item: Giro) {
    if (!item.payableId || !storeId || !userId) return;
    try {
      const scope = { storeId, userId, payableId: item.payableId };
      const saved = readPendingGiroPayment(window.localStorage, scope);
      const initialGeneration = list.data?.paymentGeneration;
      if (!saved && initialGeneration === undefined) throw new Error("Status pembayaran belum tersedia. Muat ulang daftar dan coba lagi.");
      setPendingById(current => ({ ...current, [item.payableId!]: saved }));
      if (pendingById[item.payableId] && !saved) return;
      setSelection({ item, mode: "payment", initialPending: saved, initialGeneration });
    } catch (cause) {
      setPendingById(current => ({ ...current, [item.payableId!]: { error: cause instanceof Error ? cause.message : "Penyimpanan pembayaran tidak tersedia." } }));
    }
  }

  return (
    <section aria-labelledby="giro-title" className="mt-5 border-t border-surface-200 pt-5">
      <h2 id="giro-title" className="text-sm font-semibold text-surface-900">Giro Pembelian</h2>
      <p className="mt-1 text-xs text-surface-600">Periksa riwayat dan catat pembayaran giro agar saldo dan arus kas sesuai.</p>
      {canUpdate && Object.entries(pendingById).filter(([id, pending]) => pending && 'key' in pending && pending.resource !== 'MANUAL' && !items?.some(item => item.payableId === id)).map(([id, value]) => {
        const pending = value as PendingGiroPayment;
        const balance = Number(pending.expectedBalance ?? 0);
        const missing: Giro = { goodsPurchaseId: '', number: 'Giro sebelumnya', supplierName: 'Pembayaran belum dipastikan', amount: balance, debtDate: null, dueDate: null, payableId: id, status: 'UNKNOWN', paid: null, remaining: balance, payments: [] };
        return <div key={id} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p>Pembayaran {formatRupiah(Number(pending.amount))} pada {pending.paidAt} belum dipastikan.</p><button type="button" className="rounded-lg border border-amber-400 px-3 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-brand-500" onClick={() => openPayment(missing)}>Pastikan pembayaran</button></div>;
      })}
      {list.isLoading ? <p className="mt-4 text-sm text-surface-500" role="status">Memuat giro...</p> : list.isError ? <p className="mt-4 text-sm text-red-700" role="alert">Giro belum dapat dimuat. <button type="button" onClick={() => void list.refetch()} className="underline">Coba lagi</button></p> : !list.data?.items.length ? <p className="mt-4 text-sm text-surface-500">Belum ada giro pembelian.</p> : (
        <ul className="mt-3 space-y-3">
          {list.data.items.map(item => {
            const saved = item.payableId ? pendingById[item.payableId] : null;
            const pending = saved && "key" in saved ? saved : null;
            const storageError = saved && "error" in saved ? saved.error : null;
            const hasLegacyPayment = Boolean(item.payableId && legacyPaymentIds.includes(item.payableId));
            const StatusIcon = statusIcons[item.status];
            return (
            <li key={item.goodsPurchaseId} className="relative overflow-hidden rounded-xl border border-surface-200 bg-white p-3.5 shadow-sm transition-colors hover:border-brand-200 sm:p-4">
              <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${statusRailTone[item.status]}`} />
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start">
                <div className="min-w-0 pl-1.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                      <ReceiptText className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-all text-sm font-bold tracking-tight text-surface-900">{item.number}</p>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold leading-none ${statusBadgeTone[item.status]}`}>
                          <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />{statusLabel[item.status]}
                        </span>
                      </div>
                      <p className="mt-1 break-words text-sm font-medium text-surface-700">{item.supplierName}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-700">Nominal Giro</p>
                      <p className="mt-0.5 break-words text-base font-bold tabular-nums text-brand-900">{formatRupiah(item.amount)}</p>
                    </div>
                    <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2.5">
                      <div className="flex items-center gap-2 text-surface-500">
                        <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">Jatuh tempo</p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-surface-800">
                        {item.dueDate ? <>
                          <span className="rounded-full bg-white px-2 py-0.5 text-brand-800 ring-1 ring-inset ring-brand-100">{giroMonthLabel(item.dueDate, asOf)}</span>
                          <span className="tabular-nums">{item.dueDate}</span>
                        </> : <span>Belum tersedia</span>}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-200 bg-white px-3 py-2.5">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-surface-500">Sisa tagihan</p>
                      <p className="mt-0.5 text-sm font-bold tabular-nums text-surface-900">{item.remaining !== null ? formatRupiah(item.remaining) : "Belum diketahui"}</p>
                    </div>
                    {item.balanceIncludesOtherMethods && <p className="inline-flex max-w-full items-start gap-1.5 text-[11px] leading-relaxed text-surface-600">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" aria-hidden="true" />
                      <span>Sisa memperhitungkan pembayaran pembelian sampai hari ini.</span>
                    </p>}
                    {typeof item.creditApplied === "number" && item.creditApplied > 0 && <p className="text-[11px] font-medium text-surface-600">Kredit terpakai <span className="font-semibold tabular-nums">{formatRupiah(item.creditApplied)}</span></p>}
                  </div>

                  {!item.debtDate && <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-red-700"><CircleAlert className="h-4 w-4" aria-hidden="true" />Tanggal kewajiban belum tersedia.</p>}

                  {Boolean(item.schedule?.length) && <section aria-label="Jadwal giro" className="mt-3 rounded-xl border border-surface-200 bg-surface-50/70 p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-brand-700 ring-1 ring-inset ring-surface-200">
                        <CalendarDays className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <h3 className="text-xs font-semibold text-surface-800">Jadwal giro</h3>
                      <span className="ml-auto rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-surface-600 ring-1 ring-inset ring-surface-200">{item.schedule?.length} tahap</span>
                    </div>
                    <ol className="mt-3 space-y-3 border-l border-brand-200 pl-4">
                      {item.schedule?.map((giro, index) => <li key={giro.id} className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span aria-hidden="true" className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500 shadow-sm" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-surface-800">Giro {index + 1}</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-brand-800 ring-1 ring-inset ring-brand-100">{giroMonthLabel(giro.dueDate, asOf)}</span>
                          </div>
                          <p className="mt-1 break-words text-[11px] text-surface-500">{giro.dueDate || "Tanggal belum tersedia"}{giro.note ? ` · ${giro.note}` : ""}</p>
                        </div>
                        <strong className="text-xs font-semibold tabular-nums text-surface-800">{formatRupiah(giro.amount)}</strong>
                      </li>)}
                    </ol>
                  </section>}

                  {item.remaining !== null && Boolean(item.futurePayments?.length) && <aside aria-label="Pembayaran tercatat untuk tanggal mendatang" className="mt-3 flex gap-3 rounded-xl border border-brand-200 bg-brand-50/70 p-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 ring-1 ring-inset ring-brand-100">
                      <Clock3 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold text-brand-900">Pembayaran tercatat untuk tanggal mendatang</p>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-brand-800 ring-1 ring-inset ring-brand-100">{item.futurePayments?.length} pembayaran</span>
                      </div>
                      <ul className="mt-2 space-y-1.5">
                        {item.futurePayments?.map((payment, index) => <li key={`${payment.id ?? index}-${payment.paidAt}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-brand-100/80 pt-1.5 text-[11px] text-surface-700">
                          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-brand-700" aria-hidden="true" />{giroMonthLabel(payment.paidAt, asOf)} · <span className="tabular-nums">{payment.paidAt}</span></span>
                          <strong className="font-semibold tabular-nums text-surface-900">{formatRupiah(payment.amount)}</strong>
                        </li>)}
                      </ul>
                      <p className="mt-2 text-[11px] leading-relaxed text-surface-600">Sisa di atas berlaku per {asOf} dan otomatis berkurang pada tanggal pembayaran.</p>
                      {item.availableToPay !== null && item.availableToPay !== undefined && <p className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-100 bg-white px-2.5 py-2 text-[11px]">
                        <span className="font-medium text-surface-600">Maksimal pembayaran baru</span>
                        <strong className="font-bold tabular-nums text-brand-900">{formatRupiah(item.availableToPay)}</strong>
                      </p>}
                    </div>
                  </aside>}

                  {hasLegacyPayment && <p role="status" className="mt-3 inline-flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Catatan pembayaran lama perlu diperiksa pada panel pemulihan sebelum mencatat pembayaran baru.</p>}
                  {item.historyIssue && <p role="status" className="mt-3 inline-flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Riwayat pembayaran tidak sesuai. Hubungi pengelola untuk memeriksa data giro ini.</p>}
                  {storageError && <p role="alert" className="mt-3 inline-flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{storageError}</p>}

                  {item.status !== "UNKNOWN" && item.payments.length > 0 && <details className="group mt-3 overflow-hidden rounded-xl border border-surface-200 bg-white">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-surface-700 outline-none transition-colors hover:bg-surface-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500">
                      <History className="h-4 w-4 text-brand-700" aria-hidden="true" />
                      <span>Riwayat pembayaran</span>
                      <span className="rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-semibold text-surface-600">{item.payments.length}</span>
                      <ChevronDown className="ml-auto h-4 w-4 text-surface-500 transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <ul className="divide-y divide-surface-100 border-t border-surface-200 px-3">
                      {item.payments.map((payment, index) => <li key={`${payment.paidAt}-${index}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-xs">
                        <span className="text-surface-600">{payment.paidAt}</span>
                        <strong className="tabular-nums text-surface-900">{formatRupiah(payment.amount)}</strong>
                      </li>)}
                    </ul>
                  </details>}
                </div>
                <div className="sm:w-48 sm:justify-self-end sm:pt-1">
                  <GiroAction item={item} canUpdate={canUpdate} pending={Boolean(pending)} blocked={Boolean(storageError) || hasLegacyPayment || !storeId || !userId} hasManualPayables={canLinkManual && Boolean(list.data?.manualPayables.length)} onReview={() => setSelection({ item, mode: "review" })} onPay={() => openPayment(item)} onLink={() => setLinkItem(item)} />
                </div>
              </div>
            </li>
          ); })}
        </ul>
      )}
      {selection && <GiroDialog item={selection.item} mode={selection.mode} scope={storeId && userId && selection.item.payableId ? { storeId, userId, payableId: selection.item.payableId } : null} manualPayables={canLinkManual ? list.data?.manualPayables ?? [] : []} initialPending={selection.initialPending ?? null} initialGeneration={selection.initialGeneration} onPendingChange={value => { if (selection.item.payableId) setPendingById(current => ({ ...current, [selection.item.payableId!]: value })); }} onClose={() => setSelection(null)} onSaved={() => queryClient.invalidateQueries({ queryKey: ["finance"] })} onRefreshReview={async () => { const result = await list.refetch(); if (result.isError || !result.data) throw new Error("Gagal memuat giro"); return { ...result.data, manualPayables: canLinkManual ? result.data.manualPayables : [] }; }} />}
      {linkItem && <GiroLinkDialog item={linkItem} manualPayables={list.data?.manualPayables ?? []} onClose={() => setLinkItem(null)} onSaved={() => queryClient.invalidateQueries({ queryKey: ["finance"] })} onRefresh={async () => { const result = await list.refetch(); if (result.isError || !result.data) throw new Error("Gagal memuat giro"); return result.data; }} />}
    </section>
  );
}
