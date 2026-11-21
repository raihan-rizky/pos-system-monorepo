"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@pos/ui";
import { Plus, X } from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import { jakartaToday } from "../helpers/supplier-payable-input";
import { MANUAL_EXPENSE_REPORT_CATEGORIES, MANUAL_EXPENSE_REPORT_LABELS, type ManualExpenseReportCategory } from "../helpers/manual-report-categories";
import { GiroPanel } from "./GiroPanel";
import { LegacyGiroPaymentRecovery } from "./LegacyGiroPaymentRecovery";
import { GIRO_PAYMENT_CHANGE_EVENT, GiroPaymentError, listLegacyGiroPayments, listPendingGiroPayments, postGiroPayment, readGiroPaymentGeneration, readPendingGiroPayment, removeLegacyGiroPayment, type LegacyGiroPayment, type PendingGiroPayment } from "../helpers/giro-payment-request";

type PayablePayment = { id: string; amount: number; paidAt: string; origin: "MANUAL" | "AUTO" | "CORRECTED_AUTO" };
type Payable = { id: string; ledgerVersion?: string; supplierName: string; amount: number; paid: number; debtDate: string; dueDate: string | null; note: string | null; reportCategory: ManualExpenseReportCategory | null; payments?: PayablePayment[] };
type PayablePage = { items: Payable[]; page: number; total: number };
type CreateAttempt = { key: string; body: string | null; completedAt: string | null };
type CreateAttemptState = { version: string; attempt: CreateAttempt | null };
const control = "mt-1.5 min-h-11 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-base text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 sm:text-sm";
const payableCurrency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const formatRupiah = (amount: number) => payableCurrency.format(amount);
function createPayableKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "Permintaan belum berhasil. Silakan coba lagi.");
  return data as T;
}

function PayableDialog({ title, onClose, busy, children }: { title: string; onClose: () => void; busy: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-surface-200 bg-white p-0 text-surface-900 shadow-xl backdrop:bg-surface-950/45 open:flex open:flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-surface-200 px-5 py-4">
        <div><h2 id={titleId} className="text-lg font-semibold">{title}</h2><p className="mt-1 text-xs leading-relaxed text-surface-500">{title === "Tambahkan Hutang" ? "Catat rincian hutang pemasok dan pembayaran awal jika ada." : title === "Ubah Hutang" ? "Perbarui rincian dan kategori laporan hutang." : "Catat pembayaran untuk mengurangi sisa hutang."}</p></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Tutup" className="rounded-lg p-2 text-surface-500 hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-brand-500"><X className="h-5 w-5" aria-hidden="true" /></button>
      </header>
      {children}
    </dialog>
  );
}

type SupplierPayablesPermissions = { canRead?: boolean; canCreate: boolean; canUpdate: boolean; canEdit?: boolean; canEditPayment?: boolean; canReadGiro?: boolean; canUpdateGiro?: boolean };
type LegacyPaymentPermissions = Pick<Required<SupplierPayablesPermissions>, "canRead" | "canUpdate" | "canReadGiro" | "canUpdateGiro">;

function canReviewLegacyPayment(record: LegacyGiroPayment, permissions: LegacyPaymentPermissions) {
  if (record.pending?.resource === "MANUAL") return permissions.canRead && permissions.canUpdate;
  if (record.pending?.resource === "GIRO") return permissions.canReadGiro && permissions.canUpdateGiro;
  return permissions.canRead && permissions.canUpdate && permissions.canReadGiro && permissions.canUpdateGiro;
}

export function SupplierPayablesPanel({ canRead = true, canCreate, canUpdate, canEdit = false, canEditPayment = false, canReadGiro = true, canUpdateGiro = canUpdate }: SupplierPayablesPermissions) {
  const { userId, storeId, authorizationFingerprint } = useRole();
  const identity = JSON.stringify([storeId, userId, authorizationFingerprint, canRead, canCreate, canUpdate, canEdit, canEditPayment, canReadGiro, canUpdateGiro]);
  return <SupplierPayablesPanelState key={identity} userId={userId} storeId={storeId} authorizationFingerprint={authorizationFingerprint} canRead={canRead} canCreate={canCreate} canUpdate={canUpdate} canEdit={canEdit} canEditPayment={canEditPayment} canReadGiro={canReadGiro} canUpdateGiro={canUpdateGiro} />;
}

function SupplierPayablesPanelState({ userId, storeId, authorizationFingerprint, canRead, canCreate, canUpdate, canEdit, canEditPayment, canReadGiro, canUpdateGiro }: { userId: string | null; storeId: string | null; authorizationFingerprint: string | null } & Required<SupplierPayablesPermissions>) {
  const queryClient = useQueryClient();
  const submitting = useRef(false);
  const active = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<"create" | "edit" | "payment" | "editPayment" | null>(null);
  const [selected, setSelected] = useState<Payable | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PayablePayment | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [amount, setAmount] = useState("");
  const [debtDate, setDebtDate] = useState(jakartaToday);
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [reportCategory, setReportCategory] = useState("");
  const [payment, setPayment] = useState("");
  const [paidAt, setPaidAt] = useState(jakartaToday);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPayments, setPendingPayments] = useState<Record<string, PendingGiroPayment>>({});
  const [legacyPayments, setLegacyPayments] = useState<LegacyGiroPayment[]>([]);
  const [legacyGiroPaymentIds, setLegacyGiroPaymentIds] = useState<string[]>([]);
  const [hasUnclassifiedLegacyPayments, setHasUnclassifiedLegacyPayments] = useState(false);
  const [legacyStorageError, setLegacyStorageError] = useState<string | null>(null);
  const [legacyRecoveryRecord, setLegacyRecoveryRecord] = useState<LegacyGiroPayment | null>(null);
  const [paymentPending, setPaymentPending] = useState<PendingGiroPayment | null>(null);
  const [paymentGeneration, setPaymentGeneration] = useState<string | null>(null);
  const [paymentBalance, setPaymentBalance] = useState("");
  const [paymentVersion, setPaymentVersion] = useState<string | undefined>();
  const [paymentStale, setPaymentStale] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [paymentStorageError, setPaymentStorageError] = useState<string | null>(null);
  const [createVersion, setCreateVersion] = useState("0");
  const [createAttempt, setCreateAttempt] = useState<CreateAttempt | null>(null);
  const [createCheckRequired, setCreateCheckRequired] = useState(false);

  useLayoutEffect(() => {
    active.current = true;
    const controller = new AbortController();
    requestController.current = controller;
    return () => { active.current = false; controller.abort(); };
  }, []);

  const list = useQuery({
    queryKey: ["finance", "supplier-payables", storeId, userId, authorizationFingerprint, page],
    enabled: Boolean(canRead && storeId && userId),
    queryFn: async ({ signal }) => {
      let paymentGeneration: string | null | undefined;
      try { paymentGeneration = readGiroPaymentGeneration(window.localStorage, { storeId: storeId! }); } catch { paymentGeneration = undefined; }
      return { ...await responseJson<PayablePage>(await fetch(`/api/finance/supplier-payables?page=${page}`, { cache: "no-store", signal })), paymentGeneration };
    },
  });

  const attemptKey = ["finance", "supplier-payables", "manual-attempt", storeId, userId, authorizationFingerprint] as const;
  const attempts = useQuery({
    queryKey: attemptKey,
    enabled: Boolean(canCreate && storeId && userId),
    queryFn: async ({ signal }) => responseJson<CreateAttemptState>(await fetch("/api/finance/supplier-payables/manual-attempt", { cache: "no-store", signal })),
  });

  function applyCreateState(state: CreateAttemptState) {
    queryClient.setQueryData(attemptKey, state);
    setCreateVersion(state.version); setCreateAttempt(state.attempt); setCreateCheckRequired(false);
    if (state.attempt?.body) {
      const saved = JSON.parse(state.attempt.body) as { supplierName: string; amount: number | string; debtDate: string; dueDate: string | null; note: string | null; reportCategory: string; initialPayment: number | string | null; initialPaidAt: string | null };
      setSupplierName(saved.supplierName); setAmount(String(saved.amount)); setDebtDate(saved.debtDate); setDueDate(saved.dueDate ?? ""); setNote(saved.note ?? ""); setReportCategory(saved.reportCategory); setPayment(saved.initialPayment == null ? "" : String(saved.initialPayment)); setPaidAt(saved.initialPaidAt ?? jakartaToday());
    }
  }

  async function refreshCreateState(controller: AbortController) {
    try {
      const state = await responseJson<CreateAttemptState>(await fetch("/api/finance/supplier-payables/manual-attempt", { cache: "no-store", signal: controller.signal }));
      if (active.current) applyCreateState(state);
      return state;
    } catch {
      if (active.current) setCreateCheckRequired(true);
      return null;
    }
  }

  async function checkCreateState() {
    const controller = requestController.current;
    if (!controller || submitting.current) return;
    const state = await refreshCreateState(controller);
    if (active.current && state && !state.attempt && createAttempt) { setMode(null); await queryClient.invalidateQueries({ queryKey: ["finance"] }); }
  }

  async function clearCreateAttempt(attempt: CreateAttempt, controller: AbortController) {
    const response = await fetch("/api/finance/supplier-payables/manual-attempt", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: attempt.key, expectedCompleted: Boolean(attempt.completedAt) }), signal: controller.signal });
    const state = await response.json().catch(() => null) as (CreateAttemptState & { message?: string }) | null;
    if (state && typeof state.version === "string") applyCreateState(state);
    if (!response.ok || !state) throw new Error(state?.message || "Status hutang belum dapat diselesaikan.");
  }

  async function finishCreateAttempt() {
    const controller = requestController.current;
    if (!controller || !createAttempt || submitting.current || createCheckRequired) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      await clearCreateAttempt(createAttempt, controller);
      if (active.current) { setMode(null); await queryClient.invalidateQueries({ queryKey: ["finance"] }); }
    } catch (cause) {
      if (active.current) {
        setError(cause instanceof Error ? cause.message : "Status hutang belum dapat diselesaikan.");
        const state = await refreshCreateState(controller);
        if (active.current && state && !state.attempt) { setMode(null); await queryClient.invalidateQueries({ queryKey: ["finance"] }); }
      }
    } finally { submitting.current = false; if (active.current) setBusy(false); }
  }

  useEffect(() => {
    if (!canRead || !canUpdate || !userId || !storeId) return;
    const refresh = () => {
      try {
        const next = listPendingGiroPayments(window.localStorage, { userId, storeId });
        setPendingPayments(next); setStorageError(null);
      } catch (cause) { setStorageError(cause instanceof Error ? cause.message : "Penyimpanan pembayaran tidak tersedia."); }
    };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener(GIRO_PAYMENT_CHANGE_EVENT, refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("focus", refresh); window.removeEventListener(GIRO_PAYMENT_CHANGE_EVENT, refresh); };
  }, [canRead, canUpdate, storeId, userId]);

  const refreshLegacyPayments = useCallback(() => {
    const records = listLegacyGiroPayments(window.sessionStorage);
    const permissions = { canRead, canUpdate, canReadGiro, canUpdateGiro };
    setLegacyPayments(records.filter(record => canReviewLegacyPayment(record, permissions)));
    setLegacyGiroPaymentIds(records.filter(record => record.pending?.resource !== "MANUAL").map(record => record.payableId));
    setHasUnclassifiedLegacyPayments(records.some(record => !record.pending?.resource));
    setLegacyStorageError(null);
  }, [canRead, canUpdate, canReadGiro, canUpdateGiro]);

  useEffect(() => {
    if (!(canRead && canUpdate) && !(canReadGiro && canUpdateGiro)) {
      setLegacyPayments([]);
      setLegacyGiroPaymentIds([]);
      setHasUnclassifiedLegacyPayments(false);
      setLegacyStorageError(null);
      return;
    }
    const refresh = () => {
      try { refreshLegacyPayments(); }
      catch (cause) { setLegacyStorageError(cause instanceof Error ? cause.message : "Penyimpanan pembayaran tidak tersedia."); }
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(GIRO_PAYMENT_CHANGE_EVENT, refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener(GIRO_PAYMENT_CHANGE_EVENT, refresh); };
  }, [canRead, canUpdate, canReadGiro, canUpdateGiro, refreshLegacyPayments]);

  function openCreate() {
    if (!attempts.data) return;
    setSupplierName(""); setAmount(""); setDebtDate(jakartaToday()); setDueDate(""); setNote(""); setReportCategory(""); setPayment(""); setPaidAt(jakartaToday()); setError(null); applyCreateState(attempts.data); setMode("create");
  }
  function openLegacyPayment(record: LegacyGiroPayment) {
    if (!canReviewLegacyPayment(record, { canRead, canUpdate, canReadGiro, canUpdateGiro })) {
      setLegacyStorageError("Izin untuk memeriksa pembayaran lama ini belum diberikan.");
      return;
    }
    if (!record.pending) return;
    try {
      if (!userId || !storeId) throw new Error("Identitas pengguna atau toko belum tersedia.");
      const scope = { userId, storeId, payableId: record.payableId };
      if (readPendingGiroPayment(window.localStorage, scope)) throw new Error("Ada catatan pembayaran lain untuk hutang ini. Periksa riwayat sebelum melanjutkan.");
      const pending = record.pending;
      const remaining = Number(pending.expectedBalance ?? pending.amount);
      setSelected({ id: record.payableId, supplierName: "Hutang dari sesi lama", amount: remaining, paid: 0, debtDate: pending.paidAt, dueDate: null, note: null, reportCategory: null });
      setError(null); setPaymentStale(false); setMode("payment"); setLegacyRecoveryRecord(record);
      setPaymentPending(pending); setPaymentGeneration(list.data?.paymentGeneration ?? null);
      setPayment(pending.amount); setPaidAt(pending.paidAt); setPaymentBalance(pending.expectedBalance ?? ""); setPaymentVersion(pending.expectedLedgerVersion);
      setPaymentStorageError(null);
    } catch (cause) {
      setPaymentStorageError(cause instanceof Error ? cause.message : "Penyimpanan pembayaran tidak tersedia.");
    }
  }

  function handleRemoveLegacyPayment(record: LegacyGiroPayment) {
    if (!canReviewLegacyPayment(record, { canRead, canUpdate, canReadGiro, canUpdateGiro })) {
      setLegacyStorageError("Izin untuk mengelola pembayaran lama ini belum diberikan.");
      return;
    }
    try {
      if (!removeLegacyGiroPayment(window.sessionStorage, record)) {
        refreshLegacyPayments();
        setLegacyStorageError("Catatan lama berubah. Periksa kembali sebelum menghapus.");
        return;
      }
      refreshLegacyPayments();
      window.dispatchEvent(new Event(GIRO_PAYMENT_CHANGE_EVENT));
    } catch (cause) {
      setLegacyStorageError(cause instanceof Error ? cause.message : "Penyimpanan pembayaran tidak tersedia.");
    }
  }

  function openPayment(item: Payable, requirePending = false) {
    try {
      if (!userId || !storeId) throw new Error("Identitas pengguna atau toko belum tersedia.");
      const legacy = legacyPayments.find(record => record.payableId === item.id);
      if (legacy) { openLegacyPayment(legacy); return; }
      const scope = { userId, storeId, payableId: item.id };
      const pending = readPendingGiroPayment(window.localStorage, scope);
      const generation = list.data?.paymentGeneration;
      if (!pending && generation === undefined) throw new Error("Status pembayaran belum tersedia. Muat ulang daftar dan coba lagi.");
      if (requirePending && !pending) { setPendingPayments(current => { const next = { ...current }; delete next[item.id]; return next; }); return; }
      setSelected(item); setError(null); setPaymentStale(false); setMode("payment"); setLegacyRecoveryRecord(null);
      setPaymentPending(pending); setPaymentGeneration(generation ?? null); setPayment(pending?.amount ?? ""); setPaidAt(pending?.paidAt ?? jakartaToday());
      setPaymentBalance(pending?.expectedBalance ?? String((Math.round(item.amount * 100) - Math.round(item.paid * 100)) / 100));
      setPaymentVersion(pending ? pending.expectedLedgerVersion : item.ledgerVersion);
      setPaymentStorageError(null);
    } catch (cause) { setPaymentPending(null); setPayment(""); setPaidAt(jakartaToday()); setPaymentBalance(""); setPaymentStorageError(cause instanceof Error ? cause.message : "Penyimpanan pembayaran tidak tersedia."); }
  }
  function openEdit(item: Payable) {
    setSelected(item); setSupplierName(item.supplierName); setAmount(String(item.amount)); setDebtDate(item.debtDate); setDueDate(item.dueDate ?? ""); setNote(item.note ?? ""); setReportCategory(item.reportCategory ?? ""); setError(null); setMode("edit");
  }
  function openEditPayment(item: Payable, entry: PayablePayment) {
    setSelected(item); setSelectedPayment(entry); setPayment(String(entry.amount)); setPaidAt(entry.paidAt); setError(null); setMode("editPayment");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const controller = requestController.current;
    if (!active.current || !controller || controller.signal.aborted || submitting.current || !mode || (mode === "create" && (!canCreate || createCheckRequired || Boolean(createAttempt && (!createAttempt.body || createAttempt.completedAt)))) || (mode === "edit" && (!canEdit || !selected)) || (mode === "payment" && (!canUpdate || !selected || !userId || !storeId || paymentStorageError || paymentStale)) || (mode === "editPayment" && (!canEditPayment || !selected || !selectedPayment))) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const url = mode === "create" ? "/api/finance/supplier-payables" : `/api/finance/supplier-payables/${encodeURIComponent(selected!.id)}${mode === "payment" ? "/payments" : mode === "editPayment" ? `/payments/${encodeURIComponent(selectedPayment!.id)}` : ""}`;
      const body = mode === "create" || mode === "edit"
        ? { supplierName, amount, debtDate, dueDate, note, reportCategory, ...(mode === "create" ? { initialPayment: payment, initialPaidAt: paidAt } : { expected: { supplierName: selected!.supplierName, amount: selected!.amount, debtDate: selected!.debtDate, dueDate: selected!.dueDate, note: selected!.note, reportCategory: selected!.reportCategory } }) }
        : { amount: payment, paidAt, ...(mode === "editPayment" ? { expected: { amount: selectedPayment!.amount, paidAt: selectedPayment!.paidAt, origin: selectedPayment!.origin } } : {}) };
      if (mode === "create") {
        let attempt = createAttempt;
        let version = createVersion;
        if (!attempt) {
          const response = await fetch("/api/finance/supplier-payables/manual-attempt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: createPayableKey(), version: createVersion, body }), signal: controller.signal });
          const state = await response.json().catch(() => null) as (CreateAttemptState & { message?: string }) | null;
          if (state && typeof state.version === "string") applyCreateState(state);
          if (!response.ok || !state?.attempt) throw new Error(state?.message || "Percobaan hutang belum dapat disimpan.");
          version = state.version;
          attempt = state.attempt;
        }
        if (!attempt.body) throw new Error("Rincian hutang tidak tersedia untuk izin Anda saat ini.");
        await responseJson(await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.key }, body: attempt.body, signal: controller.signal }));
        if (active.current) {
          applyCreateState({ version, attempt: { ...attempt, completedAt: new Date().toISOString() } });
          setPage(1);
          await queryClient.invalidateQueries({ queryKey: ["finance"] });
        }
        return;
      } else if (mode === "payment") {
        const scopedFetch: typeof fetch = (input, init) => active.current && !controller.signal.aborted
          ? fetch(input, { ...init, signal: controller.signal }) : Promise.reject(new DOMException("Dialog ditutup.", "AbortError"));
        const paymentDraft = paymentPending
          ? { amount: payment, paidAt, ...(paymentPending.expectedBalance !== undefined ? { expectedBalance: paymentBalance } : {}), ...(paymentPending.expectedLedgerVersion !== undefined ? { expectedLedgerVersion: paymentVersion } : {}), ...(paymentPending.resource !== undefined ? { resource: paymentPending.resource } : {}) }
          : { amount: payment, paidAt, expectedBalance: paymentBalance, expectedLedgerVersion: paymentVersion, resource: "MANUAL" as const };
        await postGiroPayment(window.localStorage, { userId: userId!, storeId: storeId!, payableId: selected!.id }, paymentDraft, scopedFetch, undefined, undefined, controller.signal, paymentPending?.key, paymentGeneration,
          legacyRecoveryRecord ? { recoverLegacy: true, expectedLegacyRaw: legacyRecoveryRecord.raw } : undefined);
        setPendingPayments(current => { const next = { ...current }; delete next[selected!.id]; return next; });
        setLegacyRecoveryRecord(null);
      } else await responseJson(await fetch(url, { method: mode === "edit" || mode === "editPayment" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal }));
      if (!active.current) return;
      setMode(null);
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
    } catch (cause) {
      if (active.current) {
        setError(cause instanceof Error ? cause.message : "Data belum dapat disimpan. Silakan coba lagi.");
        if (mode === "create") await refreshCreateState(controller);
        if (mode === "payment" && selected && userId && storeId) {
          try {
            const pending = legacyRecoveryRecord?.pending ?? readPendingGiroPayment(window.localStorage, { userId, storeId, payableId: selected.id });
            setPaymentPending(pending);
            if (pending) { setPayment(pending.amount); setPaidAt(pending.paidAt); setPaymentBalance(pending.expectedBalance ?? ""); setPaymentVersion(pending.expectedLedgerVersion); }
            setPendingPayments(current => { const next = { ...current }; if (pending) next[selected.id] = pending; else delete next[selected.id]; return next; });
          } catch (storageCause) { setPaymentStorageError(storageCause instanceof Error ? storageCause.message : "Penyimpanan pembayaran tidak tersedia."); }
          if (cause instanceof GiroPaymentError) { setPaymentStale(true); void queryClient.invalidateQueries({ queryKey: ["finance"] }); }
        }
      }
    } finally { submitting.current = false; if (active.current) setBusy(false); }
  }

  return (
    <section aria-labelledby={canRead || canCreate ? "supplier-payables-title" : undefined} aria-label={canRead || canCreate ? undefined : "Giro dan pemulihan pembayaran"} className="rounded-2xl border border-surface-200 bg-white p-3 shadow-sm sm:p-4 md:p-5">
      {(canRead || canCreate) && <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="supplier-payables-title" className="text-sm font-semibold text-surface-900">Hutang Pemasok</h2><p className="mt-1 text-xs text-surface-600">Catat hutang dan pembayarannya agar saldo masuk ke laporan bulanan.</p></div>
        {canCreate && <Button type="button" variant="secondary" onClick={openCreate} disabled={!attempts.data} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>{attempts.data?.attempt ? "Periksa hutang sebelumnya" : "Tambahkan Hutang"}</Button>}
      </div>
      <p className="mt-2 text-xs text-surface-500">Pembayaran hutang masuk laporan pada tanggal pembayarannya.</p>
      {canCreate && attempts.isLoading && <p role="status" className="mt-2 text-xs text-surface-600">Memeriksa percobaan hutang...</p>}
      {canCreate && attempts.isError && <p role="alert" className="mt-2 text-sm text-red-700">Status hutang belum dapat diperiksa. <button type="button" className="underline" onClick={() => void attempts.refetch()}>Coba lagi</button></p>}
      {storageError && <p role="alert" className="mt-2 text-sm text-red-700">{storageError}</p>}
      {canRead && canUpdate && Object.entries(pendingPayments).filter(([id, pending]) => pending.resource !== "GIRO" && !list.data?.items.some(item => item.id === id)).map(([id, pending]) => <div key={id} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p>Pembayaran {formatRupiah(Number(pending.amount))} pada {pending.paidAt} belum dipastikan.</p><button type="button" className="rounded-lg border border-amber-400 px-3 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-brand-500" onClick={() => openPayment({ id, supplierName: "Hutang pemasok", amount: Number(pending.expectedBalance ?? 0), paid: 0, debtDate: "", dueDate: null, note: null, reportCategory: null }, true)}>Pastikan pembayaran</button></div>)}
      {!canRead ? <p className="mt-4 text-sm text-surface-500">Izin melihat daftar hutang belum diberikan.</p> : list.isLoading ? <p className="mt-4 text-sm text-surface-500" role="status">Memuat hutang...</p> : list.isError ? <p className="mt-4 text-sm text-red-700" role="alert">Hutang belum dapat dimuat. <button type="button" onClick={() => void list.refetch()} className="underline">Coba lagi</button></p> : !list.data?.items.length ? <p className="mt-4 text-sm text-surface-500">{page > 1 ? "Tidak ada hutang pada halaman ini." : "Belum ada hutang yang dicatat."}</p> : (
        <ul className="mt-3 divide-y divide-surface-100">
          {list.data.items.map(item => {
            const remaining = Math.max(0, (Math.round(item.amount * 100) - Math.round(item.paid * 100)) / 100);
            return <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0"><p className="break-words font-semibold text-surface-900">{item.supplierName}</p><p className="mt-1 text-xs text-surface-600">Tanggal {item.debtDate}{item.dueDate ? ` · Jatuh tempo ${item.dueDate}` : ""} · Dibayar {formatRupiah(item.paid)} · {item.reportCategory ? MANUAL_EXPENSE_REPORT_LABELS[item.reportCategory] : "Belum berkategori"}</p>{item.note && <p className="mt-1 break-words text-xs text-surface-500">{item.note}</p>}
                {!!item.payments?.length && <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-brand-700">Riwayat pembayaran</summary><ul className="mt-2 space-y-2">{item.payments.map(entry => <li key={entry.id} className="flex flex-wrap items-center gap-2 text-xs"><span>{entry.paidAt} · {formatRupiah(entry.amount)}{entry.origin === "AUTO" ? " · Otomatis" : entry.origin === "CORRECTED_AUTO" ? " · Otomatis dikoreksi" : ""}</span>{canEditPayment && <button type="button" onClick={() => openEditPayment(item, entry)} className="rounded border border-surface-300 px-2 py-1 font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">Ubah pembayaran</button>}</li>)}</ul></details>}
              </div>
          <div className="flex flex-wrap items-center gap-3"><span className="font-semibold tabular-nums">{remaining > 0 ? `Sisa ${formatRupiah(remaining)}` : "Lunas"}</span>{canEdit && <button type="button" onClick={() => openEdit(item)} className="rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-surface-50 focus-visible:outline-2 focus-visible:outline-brand-500">Ubah hutang</button>}{(remaining > 0 || pendingPayments[item.id]) && canUpdate && <button type="button" onClick={() => openPayment(item, Boolean(pendingPayments[item.id]))} className="rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-surface-50 focus-visible:outline-2 focus-visible:outline-brand-500">{pendingPayments[item.id] ? "Pastikan pembayaran" : "Catat pembayaran"}</button>}</div>
            </li>;
          })}
        </ul>
      )}
      {canRead && !!list.data && (list.data.total > 20 || page > 1) && <div className="mt-3 flex items-center justify-end gap-2 text-xs"><span>Halaman {page}</span><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Sebelumnya</button><button type="button" disabled={page * 20 >= list.data.total} onClick={() => setPage(value => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Berikutnya</button></div>}
      </>}
      {legacyStorageError && (canReadGiro || canRead) && <p role="alert" className="mb-3 text-sm text-red-700">{legacyStorageError}</p>}
      {hasUnclassifiedLegacyPayments && !(canRead && canUpdate && canReadGiro && canUpdateGiro) && (canReadGiro || canRead) && <p role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Ada pembayaran lama yang belum dapat dikenali jenisnya. Minta pengelola dengan akses hutang dan Giro meninjau catatan tersebut sebelum mencatat pembayaran baru.</p>}
      {legacyPayments.length > 0 && <LegacyGiroPaymentRecovery records={legacyPayments} onRecover={openLegacyPayment} onRemove={handleRemoveLegacyPayment} />}
      {canReadGiro && <GiroPanel canUpdate={canUpdateGiro} canLinkManual={canRead && canEdit && canEditPayment} legacyPaymentIds={legacyGiroPaymentIds} />}
       {mode && <PayableDialog title={mode === "create" ? "Tambahkan Hutang" : mode === "edit" ? "Ubah Hutang" : mode === "editPayment" ? "Ubah Pembayaran Hutang" : legacyRecoveryRecord ? "Periksa Pembayaran Lama" : "Catat Pembayaran Hutang"} busy={busy} onClose={() => { if (!submitting.current) { setMode(null); setLegacyRecoveryRecord(null); } }}>
        <form onSubmit={event => void submit(event)} className="flex min-h-0 flex-col overflow-hidden" aria-busy={busy}>
          <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5">
            {mode === "payment" && legacyRecoveryRecord && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Pemeriksaan ini memakai kunci tersimpan dan tidak membuat pembayaran baru. Jika akun atau toko tidak cocok, catatan akan tetap tersimpan.</p>}
            {mode === "create" && createAttempt && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{createAttempt.completedAt ? "Hutang sebelumnya sudah tersimpan. Pilih Selesai untuk melanjutkan." : "Hasil hutang sebelumnya belum dipastikan. Pastikan hutang sebelum mencatat hutang lain."}{!createAttempt.body && " Rincian tidak tersedia untuk izin Anda saat ini."}</p>}
            {mode === "create" && createCheckRequired && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Status hutang belum dapat diperiksa. <button type="button" className="underline" onClick={() => void checkCreateState()}>Periksa lagi</button></p>}
            {(mode !== "create" || !createAttempt || createAttempt.body) && <fieldset disabled={mode === "create" && Boolean(createAttempt)} className="space-y-5"><legend className="sr-only">Data hutang dan pembayaran</legend>
            {mode === "create" || mode === "edit" ? <>
              <section aria-labelledby="payable-details-title" className="space-y-4">
                <div><h3 id="payable-details-title" className="text-sm font-semibold text-surface-900">Rincian hutang</h3><p className="mt-1 text-xs text-surface-500">Isi data yang tercantum pada tagihan pemasok.</p></div>
                <label className="block text-sm font-medium">Nama pemasok <span className="text-red-500">*</span><input autoFocus required maxLength={200} placeholder="Contoh: Toko Sumber Jaya" value={supplierName} onChange={event => setSupplierName(event.target.value)} className={control} /></label>
                <label className="block text-sm font-medium">Nominal hutang (Rp) <span className="text-red-500">*</span><input required type="number" min="0.01" max="9999999999.99" step="0.01" inputMode="decimal" placeholder="0" value={amount} onChange={event => setAmount(event.target.value)} className={control} />{Number(amount) > 0 && <span className="mt-1 block text-xs font-normal text-surface-600">{formatRupiah(Number(amount))}</span>}</label>
                <label className="block text-sm font-medium">Kategori laporan <span className="text-red-500">*</span><select required name="reportCategory" value={reportCategory} onChange={event => setReportCategory(event.target.value)} className={control}><option value="">Pilih kategori</option>{MANUAL_EXPENSE_REPORT_CATEGORIES.map(category => <option key={category} value={category}>{MANUAL_EXPENSE_REPORT_LABELS[category]}</option>)}</select></label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Tanggal hutang <span className="text-red-500">*</span><input required type="date" max={jakartaToday()} value={debtDate} onChange={event => setDebtDate(event.target.value)} className={control} /></label><label className="block text-sm font-medium">Jatuh tempo <span className="font-normal text-surface-500">(opsional)</span><input type="date" min={debtDate} value={dueDate} onChange={event => setDueDate(event.target.value)} className={control} /></label></div>
                <p className="text-xs text-surface-600">Jika jatuh tempo diisi, sisa hutang otomatis lunas pada tanggal tersebut.</p>
                <label className="block text-sm font-medium">Catatan <span className="font-normal text-surface-500">(opsional)</span><textarea maxLength={1000} placeholder="Contoh: nomor tagihan atau keterangan" value={note} onChange={event => setNote(event.target.value)} className={control} rows={2} /></label>
              </section>
              {mode === "create" && canRead && canUpdate && <div className="border-t border-surface-200" />}
            </> : <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3"><p className="text-xs text-surface-500">Hutang pemasok</p><p className="mt-1 break-words text-sm font-semibold">{selected?.supplierName}</p><p className="mt-1 text-sm text-surface-700">{paymentPending ? "Saldo sebelum pembayaran" : "Sisa"} {formatRupiah(paymentPending?.expectedBalance ? Number(paymentPending.expectedBalance) : Math.max(0, (selected?.amount ?? 0) - (selected?.paid ?? 0)))}</p></div>}
            {mode !== "edit" && (mode !== "create" || (canRead && canUpdate)) && <section aria-labelledby="payable-payment-title" className="space-y-3">
              <div><h3 id="payable-payment-title" className="text-sm font-semibold text-surface-900">{mode === "create" ? "Pembayaran awal" : "Pembayaran"}</h3><p className="mt-1 text-xs text-surface-500">{mode === "create" ? "Opsional. Isi jika sebagian hutang sudah dibayar." : "Masukkan nominal dan tanggal pembayaran."}</p></div>
              {mode === "payment" && paymentPending && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Hasil pembayaran sebelumnya belum dipastikan. Pastikan pembayaran sebelum mencatat pembayaran lain.</p>}
              <label className="block text-sm font-medium">{mode === "create" ? "Nominal pembayaran awal" : "Nominal pembayaran"} (Rp)<input autoFocus={mode === "payment" || mode === "editPayment"} required={mode !== "create"} type="number" min="0.01" step="0.01" readOnly={mode === "payment" && Boolean(paymentPending)} max={mode === "payment" && paymentPending ? undefined : mode === "payment" && selected ? Math.max(0, (Math.round(selected.amount * 100) - Math.round(selected.paid * 100)) / 100) : mode === "editPayment" && selected ? Math.max(0, (Math.round(selected.amount * 100) - (selected.payments ?? []).filter(entry => entry.id !== selectedPayment?.id && entry.origin !== "AUTO").reduce((sum, entry) => sum + Math.round(entry.amount * 100), 0)) / 100) : amount || undefined} inputMode="decimal" placeholder="0" value={payment} onChange={event => setPayment(event.target.value)} className={control} />{Number(payment) > 0 && <span className="mt-1 block text-xs font-normal text-surface-600">{formatRupiah(Number(payment))}</span>}</label>
              {(payment || mode === "payment") && <label className="block text-sm font-medium">Tanggal pembayaran<input required type="date" readOnly={mode === "payment" && Boolean(paymentPending)} min={mode === "payment" && paymentPending ? undefined : mode === "create" ? debtDate : selected?.debtDate} max={mode === "payment" && paymentPending ? undefined : jakartaToday()} value={paidAt} onChange={event => setPaidAt(event.target.value)} className={control} /></label>}
              {mode === "create" && Number(amount) > 0 && Number(payment) > 0 && (Number(payment) > Number(amount)
                ? <p className="text-xs text-red-700">Pembayaran awal tidak boleh melebihi nominal hutang.</p>
                : <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3"><span className="text-sm font-medium text-brand-800">Sisa setelah pembayaran awal</span><strong className="text-sm tabular-nums text-brand-900">{formatRupiah((Math.round(Number(amount) * 100) - Math.round(Number(payment) * 100)) / 100)}</strong></div>)}
            </section>}
            </fieldset>}
            {(error || (mode === "payment" && paymentStorageError)) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error || paymentStorageError}</p>}
          </div>
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-surface-200 bg-white px-5 py-3"><Button type="button" variant="ghost" onClick={() => { setMode(null); setLegacyRecoveryRecord(null); }} disabled={busy}>Batal</Button>{mode === "create" && createAttempt && <Button type="button" variant="secondary" onClick={() => void finishCreateAttempt()} disabled={busy || createCheckRequired}>{createAttempt.completedAt ? "Selesai" : "Lupakan"}</Button>}{!(mode === "create" && createAttempt?.completedAt) && <Button type="submit" loading={busy} disabled={busy || (mode === "create" && (createCheckRequired || Boolean(createAttempt && !createAttempt.body))) || (mode === "payment" && (paymentStale || Boolean(paymentStorageError)))}>{busy ? "Menyimpan..." : mode === "create" ? createAttempt ? "Pastikan hutang" : "Simpan hutang" : mode === "edit" || mode === "editPayment" ? "Simpan perubahan" : legacyRecoveryRecord ? "Periksa pembayaran tersimpan" : paymentPending ? "Pastikan pembayaran" : "Simpan pembayaran"}</Button>}</footer>
        </form>
      </PayableDialog>}
    </section>
  );
}
