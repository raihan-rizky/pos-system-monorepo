"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@pos/ui";
import { AlertTriangle, Link2, Plus, Trash2, X } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import { calculateTransactionTax, getTransactionTaxMethod, getTransactionTaxRate } from "@/features/transaction-tax/helpers/tax-calculation";
import { readPrintingReceiptResponse } from "../receipt-api";
import type { ProcessedInitialPaymentAllocation, ProcessedPaymentMethod, ProcessedPrintingReceiptReview, ProcessedPrintingReceiptTransactionInput } from "../processed-edit";
import { MAX_PRINTING_RECEIPT_AMOUNT } from "../domain";
import type { PrintingReceipt, PrintingReceiptLine } from "../types";
import { PrintingReceiptView } from "./PrintingReceiptView";
import { PrintingReceiptStockLinkModal } from "./PrintingReceiptStockLinkModal";

type Phase = "warning" | "edit" | "review" | "discard";
const warning = "Menyimpan perubahan akan memperbarui transaksi, menyesuaikan stok/bahan yang terpakai, serta menghitung ulang total tagihan dan sisa piutang. Transaksi yang sebelumnya lunas dapat kembali memiliki piutang jika total tagihan bertambah.";
const moneyCents = (amount: number) => Math.round(amount * 100);
const emptyLine = (): PrintingReceiptLine => ({ id: crypto.randomUUID(), name: "", material: "", quantity: null, price: null, stockLink: null });
const paymentMethodOptions: { value: ProcessedPaymentMethod; label: string }[] = [
  { value: "CASH", label: "Tunai" }, { value: "DEBIT", label: "Debit" }, { value: "CREDIT", label: "Kartu kredit" },
  { value: "QRIS", label: "QRIS" }, { value: "TRANSFER", label: "Transfer" },
];
const paymentMethodLabels = Object.fromEntries(paymentMethodOptions.map(option => [option.value, option.label])) as Record<ProcessedPaymentMethod, string>;

function formatPaymentTimestamp(value: Date | string | null | undefined): string {
  if (!value) return "Waktu penerimaan tidak tercatat";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "Waktu penerimaan tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(timestamp);
}

function transactionInputFromReceipt(receipt: PrintingReceipt): ProcessedPrintingReceiptTransactionInput {
  const transaction = receipt.transaction;
  const payments = (transaction?.payments ?? []) as { id: string; amount: number; method: string }[];
  const storedMethod = transaction?.paymentMethod;
  const oldDebtPayments = transaction?.debtPaymentLogs ?? [];
  const initialAmount = Math.max(0, Math.round((Number(transaction?.amountPaid ?? 0) - Number(transaction?.change ?? 0) - oldDebtPayments.reduce((sum, payment) => sum + Number(payment.amount), 0)) * 100) / 100);
  const legacyMethod = paymentMethodOptions.find(option => option.value === storedMethod)?.value;
  const initialPayments: ProcessedInitialPaymentAllocation[] = payments.map(payment => ({
    sourcePaymentId: payment.id,
    method: payment.method as ProcessedPaymentMethod,
    amount: Number(payment.amount),
  }));
  if (!payments.length && initialAmount > 0 && storedMethod !== "TEMPO" && legacyMethod) {
    initialPayments.push({ sourcePaymentId: null, method: legacyMethod, amount: initialAmount });
  }
  return {
    initialPayments,
    additionalPayments: [],
    salespersonId: transaction?.salespersonId ?? null,
  };
}

interface InitialPaymentGroup {
  sourcePaymentId: string | null;
  sourceTotal: number;
  allocations: { payment: ProcessedInitialPaymentAllocation; index: number }[];
}

function buildInitialPaymentGroups(
  allocations: ProcessedInitialPaymentAllocation[],
  sources: { id: string; amount: number }[],
): InitialPaymentGroup[] {
  const sourceIds = [...new Set([...sources.map(source => source.id), ...allocations.map(payment => payment.sourcePaymentId)])];
  return sourceIds.map(sourcePaymentId => {
    const rows = allocations.flatMap((payment, index) => payment.sourcePaymentId === sourcePaymentId ? [{ payment, index }] : []);
    const source = sources.find(row => row.id === sourcePaymentId);
    return {
      sourcePaymentId,
      sourceTotal: source ? Number(source.amount) : rows.reduce((sum, row) => sum + row.payment.amount, 0),
      allocations: rows,
    };
  }).filter(group => group.allocations.length > 0);
}

/** Processed corrections stay local until the reviewed, explicit commit succeeds. */
export function ProcessedPrintingReceiptEditor({ receipt, onClose, onSaved, canAddPayment }: {
  receipt: PrintingReceipt;
  onClose: () => void;
  onSaved: (receipt: PrintingReceipt) => void;
  canAddPayment: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  const transaction = receipt.transaction;
  const paymentRows = (transaction?.payments ?? []) as { id: string; amount: number; method: string }[];
  const [draft, setDraft] = useState(receipt);
  const [transactionDraft, setTransactionDraft] = useState<ProcessedPrintingReceiptTransactionInput>(() => transactionInputFromReceipt(receipt));
  const [salespersons, setSalespersons] = useState<{ id: string; name: string }[]>([]);
  const [phase, setPhase] = useState<Phase>("warning");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ProcessedPrintingReceiptReview | null>(null);
  const [stockLineId, setStockLineId] = useState<string | null>(null);
  const dirty = JSON.stringify(draft.document) !== JSON.stringify(receipt.document) || JSON.stringify(transactionDraft) !== JSON.stringify(transactionInputFromReceipt(receipt));
  const stockLine = draft.document.lines.find(line => line.id === stockLineId);
  const endpoint = `/api/printing-receipts/${encodeURIComponent(receipt.id)}/processed`;
  const salespersonOptions = transaction?.salespersonId && !salespersons.some(salesperson => salesperson.id === transaction.salespersonId)
    ? [{ id: transaction.salespersonId, name: transaction.salesperson?.name || transaction.salesName || "Sales transaksi saat ini" }, ...salespersons]
    : salespersons;
  const subtotal = draft.document.lines.reduce((sum, line) => sum + (line.price ?? 0) * (line.quantity ?? 0), 0);
  const previewSubtotal = Number.isFinite(subtotal) ? Math.min(MAX_PRINTING_RECEIPT_AMOUNT, Math.max(0, subtotal)) : MAX_PRINTING_RECEIPT_AMOUNT;
  const draftPayment = transaction ? {
    ...transaction,
    ...calculateTransactionTax({ subtotal: previewSubtotal, discount: transaction.discount, taxRate: getTransactionTaxRate(transaction), taxMethod: getTransactionTaxMethod(transaction) }),
    amountPaid: Math.max(0, transaction.amountPaid - transaction.change),
  } : undefined;
  const initialPaymentGroups = buildInitialPaymentGroups(transactionDraft.initialPayments, paymentRows);
  const currentPaid = transaction ? Math.max(0, Number(transaction.amountPaid) - Number(transaction.change)) : 0;
  const oldDebtPaymentTotal = (transaction?.debtPaymentLogs ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const expectedInitialPaid = Math.max(0, Math.round((currentPaid - oldDebtPaymentTotal) * 100) / 100);
  const transactionInitialTotal = transactionDraft.initialPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const storedInitialTotal = paymentRows.length
    ? paymentRows.reduce((sum, payment) => sum + Number(payment.amount), 0)
    : transactionInitialTotal;
  const keepsTempoWithoutRows = transaction?.paymentMethod === "TEMPO" && paymentRows.length === 0;
  const paymentDetailsAreConsistent = !transaction || keepsTempoWithoutRows || moneyCents(storedInitialTotal) === moneyCents(expectedInitialPaid);
  const missingLegacyPaymentDetails = Boolean(transaction && !paymentRows.length && !keepsTempoWithoutRows && expectedInitialPaid > 0 && !transactionDraft.initialPayments.length);
  const initialSplitError = initialPaymentGroups.some(group => group.allocations.length > 1 && (
    group.allocations.some(row => !Number.isFinite(row.payment.amount) || row.payment.amount <= 0) ||
    moneyCents(group.allocations.reduce((sum, row) => sum + row.payment.amount, 0)) !== moneyCents(group.sourceTotal)
  ));
  const additionalPaymentTotal = transactionDraft.additionalPayments.reduce((sum, payment) => sum + (Number.isFinite(payment.amount) ? payment.amount : 0), 0);
  const availableDebt = Math.max(0, Number(draftPayment?.total ?? transaction?.total ?? 0) - currentPaid);
  const additionalPaymentError = transactionDraft.additionalPayments.some(payment => !Number.isFinite(payment.amount) || payment.amount <= 0)
    ? "Isi nominal pembayaran tambahan lebih dari nol."
    : additionalPaymentTotal > availableDebt + 0.001
      ? "Jumlah pembayaran tambahan melebihi sisa piutang yang diperkirakan."
      : null;
  const paymentInputError = missingLegacyPaymentDetails
    ? "Rincian pembayaran awal lama tidak tersedia. Periksa data sebelum mengoreksi nota."
    : initialSplitError
      ? "Jumlah pecahan harus sama dengan nominal pembayaran awal."
      : additionalPaymentError;
  const splitInitialPayment = (group: InitialPaymentGroup) => {
    if (!paymentDetailsAreConsistent || !group.allocations.length) return;
    const source = group.allocations[0];
    const amountCents = moneyCents(source.payment.amount);
    const splitCents = Math.floor(amountCents / 2);
    if (splitCents <= 0 || splitCents >= amountCents) return;
    const nextMethod = paymentMethodOptions.find(option => option.value !== source.payment.method)?.value ?? source.payment.method;
    setTransactionDraft(current => ({
      ...current,
      initialPayments: [
        ...current.initialPayments.flatMap((payment, index) => index === source.index
          ? [
              { ...payment, amount: (amountCents - splitCents) / 100 },
              { sourcePaymentId: group.sourcePaymentId, method: nextMethod, amount: splitCents / 100 },
            ]
          : [payment]),
      ],
    }));
    setReview(null);
  };
  const mergeInitialPayment = (group: InitialPaymentGroup, allocationIndex: number) => {
    if (allocationIndex === 0) return;
    const removed = group.allocations[allocationIndex];
    const first = group.allocations[0];
    if (!removed || !first) return;
    setTransactionDraft(current => ({
      ...current,
      initialPayments: current.initialPayments
        .filter((_, index) => index !== removed.index)
        .map((payment, index) => {
          const oldIndex = index >= removed.index ? index + 1 : index;
          return oldIndex === first.index ? { ...payment, amount: Math.round((payment.amount + removed.payment.amount) * 100) / 100 } : payment;
        }),
    }));
    setReview(null);
  };
  const addAdditionalPayment = () => setTransactionDraft(current => ({
    ...current,
    additionalPayments: [...current.additionalPayments, { method: "CASH", amount: 0 }],
  }));

  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    element?.showModal();
    return () => { mounted.current = false; element?.close(); };
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/salespersons?activeOnly=true")
      .then(response => response.json())
      .then((result: { data?: { id?: unknown; name?: unknown }[] }) => {
        if (!active) return;
        setSalespersons(Array.isArray(result.data) ? result.data.filter((row): row is { id: string; name: string } => typeof row.id === "string" && typeof row.name === "string") : []);
      })
      .catch(() => { if (active) setSalespersons([]); });
    return () => { active = false; };
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
        body: JSON.stringify({ revision: receipt.revision, number: receipt.number, document: draft.document, transaction: transactionDraft,
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
        {transaction && <section role="region" aria-labelledby="processed-transaction-heading" className="space-y-3 rounded-lg border border-surface-200 bg-surface-50 p-4">
          <div><h3 id="processed-transaction-heading" className="font-bold text-surface-900">Data transaksi</h3><p className="mt-1 text-xs text-surface-600">Pembayaran awal tetap memakai tanggal penerimaan semula. Pembayaran tambahan dicatat sebagai uang baru saat koreksi disimpan.</p></div>
          {paymentRows.length > 0 && !paymentDetailsAreConsistent && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Rincian pembayaran awal tidak cocok dengan jumlah terbayar. Koreksi nota tetap dapat dilanjutkan, tetapi pembayaran awal tidak dapat dipecah sebelum datanya diperiksa.</p>}
          {initialPaymentGroups.map((group, sourceIndex) => <div key={group.sourcePaymentId ?? "legacy"} className="space-y-2 rounded-md border border-surface-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-surface-800">Pembayaran awal {sourceIndex + 1} · {formatRupiah(group.sourceTotal)}</p>
              {group.allocations.length > 1 && <span className="text-xs text-surface-600">Jumlah pecahan {formatRupiah(group.allocations.reduce((sum, row) => sum + row.payment.amount, 0))}</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.allocations.map(({ payment, index }, allocationIndex) => {
                const suffix = allocationIndex === 0 ? "" : " pecahan " + (allocationIndex + 1);
                const methodLabel = "Metode pembayaran " + (sourceIndex + 1) + suffix;
                const amountLabel = "Nominal pembayaran " + (sourceIndex + 1) + suffix;
                return <div key={(group.sourcePaymentId ?? "legacy") + "-" + allocationIndex} className="rounded-md border border-surface-200 bg-surface-50 p-3">
                  <label className="block text-sm font-semibold text-surface-800" htmlFor={"processed-payment-method-" + sourceIndex + "-" + allocationIndex}>{methodLabel}</label>
                  <select id={"processed-payment-method-" + sourceIndex + "-" + allocationIndex} aria-label={methodLabel} disabled={busy} value={payment.method}
                    onChange={event => setTransactionDraft(current => ({ ...current, initialPayments: current.initialPayments.map((row, rowIndex) => rowIndex === index ? { ...row, method: event.target.value as ProcessedPaymentMethod } : row) }))}
                    className="mt-1 w-full rounded-md border border-surface-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    {paymentMethodOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  {group.allocations.length > 1
                    ? <Input label={amountLabel} type="number" min="0" step="0.01" disabled={busy} value={payment.amount}
                        onChange={event => setTransactionDraft(current => ({ ...current, initialPayments: current.initialPayments.map((row, rowIndex) => rowIndex === index ? { ...row, amount: event.target.value === "" ? 0 : Number(event.target.value) } : row) }))} />
                    : <p className="mt-2 text-xs text-surface-600">Nominal awal: <strong>{formatRupiah(payment.amount)}</strong></p>}
                  {allocationIndex > 0 && <button type="button" disabled={busy} onClick={() => mergeInitialPayment(group, allocationIndex)} className="mt-2 rounded px-2 py-1 text-xs font-semibold text-danger-700 hover:bg-danger-50 focus-visible:ring-2 focus-visible:ring-danger-500">Gabungkan pecahan</button>}
                </div>;
              })}
            </div>
            <Button variant="secondary" size="sm" disabled={busy || !paymentDetailsAreConsistent || group.sourceTotal < 0.02} onClick={() => splitInitialPayment(group)}><Plus size={14} />Pecah pembayaran awal {sourceIndex + 1}</Button>
          </div>)}
          {transaction.paymentMethod === "TEMPO" && !paymentRows.length && <p className="rounded-md bg-white p-3 text-sm text-surface-700">Transaksi Tempo ini tidak memiliki pembayaran awal. Metode Tempo tetap dipertahankan.</p>}
          {canAddPayment && transaction.status !== "PENDING_APPROVAL" && <div className="space-y-3 rounded-md border border-brand-200 bg-white p-3">
            <div><h4 className="font-semibold text-surface-900">Pembayaran tambahan</h4><p className="text-xs text-surface-600">Catat uang baru yang diterima sekarang. Pembayaran ini memakai waktu dan metode penerimaan saat disimpan. Jika perubahan nota menaikkan sisa piutang, role juga memerlukan izin Ubah piutang.</p></div>
            {transactionDraft.additionalPayments.map((payment, index) => <div key={index} className="grid gap-3 rounded-md border border-surface-200 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div><label className="block text-sm font-semibold text-surface-800" htmlFor={"processed-additional-payment-method-" + index}>Metode pembayaran tambahan {index + 1}</label>
                <select id={"processed-additional-payment-method-" + index} aria-label={"Metode pembayaran tambahan " + (index + 1)} disabled={busy} value={payment.method}
                  onChange={event => setTransactionDraft(current => ({ ...current, additionalPayments: current.additionalPayments.map((row, rowIndex) => rowIndex === index ? { ...row, method: event.target.value as ProcessedPaymentMethod } : row) }))}
                  className="mt-1 w-full rounded-md border border-surface-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  {paymentMethodOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <Input label={"Nominal pembayaran tambahan " + (index + 1)} type="number" min="0" step="0.01" disabled={busy} value={payment.amount}
                onChange={event => setTransactionDraft(current => ({ ...current, additionalPayments: current.additionalPayments.map((row, rowIndex) => rowIndex === index ? { ...row, amount: event.target.value === "" ? 0 : Number(event.target.value) } : row) }))} />
              <button type="button" aria-label={"Hapus pembayaran tambahan " + (index + 1)} disabled={busy} onClick={() => setTransactionDraft(current => ({ ...current, additionalPayments: current.additionalPayments.filter((_, rowIndex) => rowIndex !== index) }))} className="rounded p-2 text-danger-700 hover:bg-danger-50 focus-visible:ring-2 focus-visible:ring-danger-500"><Trash2 size={16} /></button>
            </div>)}
            <Button variant="secondary" size="sm" disabled={busy} onClick={addAdditionalPayment}><Plus size={14} />Tambah pembayaran tambahan</Button>
            <div className="grid gap-1 text-xs text-surface-700 sm:grid-cols-3">
              <p>Terbayar saat ini: <strong>{formatRupiah(currentPaid)}</strong></p>
              <p>Pembayaran baru: <strong>{formatRupiah(additionalPaymentTotal)}</strong></p>
              <p>Perkiraan sisa piutang: <strong>{formatRupiah(Math.max(0, availableDebt - additionalPaymentTotal))}</strong></p>
            </div>
          </div>}
          {transaction.status === "PENDING_APPROVAL" && <p className="rounded-md bg-white p-3 text-sm text-surface-700">Pembayaran tambahan dapat dicatat setelah transaksi disetujui.</p>}
          {!canAddPayment && transaction.status !== "PENDING_APPROVAL" && <p className="rounded-md bg-white p-3 text-sm text-surface-700">Untuk mencatat uang baru, role Anda perlu izin Lihat piutang dan Bayar piutang.</p>}
          {paymentInputError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">{paymentInputError}</p>}
          {transaction.debtPaymentLogs?.length ? <div className="space-y-1 rounded-md bg-white p-3 text-xs text-surface-600">
            <h4 className="font-semibold text-surface-800">Riwayat pembayaran sebelumnya</h4>
            {transaction.debtPaymentLogs.map(payment => <p key={payment.id}>{formatPaymentTimestamp(payment.createdAt)} · {paymentMethodLabels[payment.paymentMethod as ProcessedPaymentMethod] ?? payment.paymentMethod} · {formatRupiah(Number(payment.amount))}</p>)}
          </div> : null}
          <label className="block max-w-sm text-sm font-semibold text-surface-800" htmlFor="processed-salesperson">Sales transaksi
            <select id="processed-salesperson" aria-label="Sales transaksi" disabled={busy} value={transactionDraft.salespersonId ?? ""}
              onChange={event => setTransactionDraft(current => ({ ...current, salespersonId: event.target.value || null }))}
              className="mt-1 w-full rounded-md border border-surface-300 bg-white px-3 py-2 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
              <option value="">Tanpa sales transaksi</option>{salespersonOptions.map(salesperson => <option key={salesperson.id} value={salesperson.id}>{salesperson.name}</option>)}
            </select>
          </label>
          {!transaction.salespersonId && transaction.salesName && <p className="text-xs text-surface-600">Nama sales yang sudah tercatat: {transaction.salesName}. Pilih sales transaksi untuk memperbarui atribusi.</p>}
        </section>}
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
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={close}>Batal edit</Button><Button disabled={!dirty || Boolean(paymentInputError)} loading={busy} onClick={() => void request(false)}>Tinjau perubahan</Button></div>
      </>}
      {phase === "review" && review && <>
        <h3 className="font-bold text-surface-900">Tinjau perubahan · {receipt.number}</h3>
        <div className="overflow-x-auto rounded-lg border border-surface-200">
          <table className="w-full text-left text-sm"><caption className="sr-only">Nilai transaksi sebelum dan sesudah koreksi</caption>
            <thead className="bg-surface-50"><tr><th scope="col" className="p-3">Rincian</th><th scope="col" className="p-3">Sebelum</th><th scope="col" className="p-3">Sesudah</th></tr></thead>
            <tbody>{([["Subtotal", "subtotal"], ["Total tagihan", "total"], ["Pembayaran bersih", "paid"], ["Sisa piutang", "debt"], ["Status transaksi", "status"]] as const).map(([label, key]) => <tr className="border-t border-surface-200" key={key}><th scope="row" className="p-3 font-medium">{label}</th><td className="whitespace-nowrap p-3">{key === "status" ? (review.before.status === "COMPLETED" ? "Lunas" : review.before.status === "PENDING_APPROVAL" ? "Menunggu persetujuan" : review.before.status) : formatRupiah(review.before[key])}</td><td className="whitespace-nowrap p-3 font-semibold">{key === "status" ? (review.after.status === "COMPLETED" ? "Lunas" : review.after.status === "PENDING_APPROVAL" ? "Menunggu persetujuan" : review.after.status) : formatRupiah(review.after[key])}</td></tr>)}</tbody>
          </table>
        </div>
        {review.after.status === "PENDING_APPROVAL" && <p className="text-sm text-surface-700">Transaksi tetap menunggu persetujuan. Stok dan piutang belum dibukukan sampai disetujui.</p>}
        {review.before.status === "COMPLETED" && review.after.debt > 0 && <p className="font-semibold text-red-800">Transaksi yang sebelumnya lunas akan kembali memiliki piutang.</p>}
        <div className="space-y-2 text-sm text-surface-700"><h4 className="font-semibold text-surface-900">Pemakaian bahan sebelum → sesudah</h4>
          {review.materials.length ? review.materials.map(material => <p className="break-words" key={material.productId}>{material.name}: {material.before} → <strong>{material.after}</strong> {material.unit}</p>) : <p>Tidak ada bahan yang terhubung ke stok.</p>}
        </div>
        <section className="space-y-2 rounded-lg border border-surface-200 p-3 text-sm text-surface-700" aria-labelledby="processed-transaction-review-heading">
          <h4 id="processed-transaction-review-heading" className="font-semibold text-surface-900">Data transaksi</h4>
          <div className="space-y-1">
            <p className="font-medium">Pembayaran awal: {formatRupiah(review.transaction.initialPaymentsBefore)} → {formatRupiah(review.transaction.initialPaymentsAfter)}</p>
            {review.transaction.initialPayments.map((payment, index) => <p className="flex flex-wrap justify-between gap-x-3" key={`${payment.sourcePaymentId ?? "legacy"}-${index}`}>
              <span>Alokasi pembayaran awal {index + 1}: <strong>{paymentMethodLabels[payment.beforeMethod as ProcessedPaymentMethod] ?? payment.beforeMethod} → {paymentMethodLabels[payment.method]}</strong></span><span>{formatRupiah(payment.amount)}</span>
            </p>)}
          </div>
          <div className="space-y-1 border-t border-surface-200 pt-2">
            <p className="font-medium">Pembayaran baru diterima: {formatRupiah(review.transaction.additionalPaymentsTotal)}</p>
            {review.transaction.additionalPayments.map((payment, index) => <p className="flex flex-wrap justify-between gap-x-3" key={`${payment.method}-${index}`}>
              <span>Pembayaran tambahan {index + 1}: <strong>{paymentMethodLabels[payment.method]}</strong></span><span>{formatRupiah(payment.amount)}</span>
            </p>)}
          </div>
          <p>Metode utama transaksi: <strong>{paymentMethodLabels[review.transaction.summaryPaymentMethod.before as ProcessedPaymentMethod] ?? review.transaction.summaryPaymentMethod.before} → {paymentMethodLabels[review.transaction.summaryPaymentMethod.after as ProcessedPaymentMethod] ?? review.transaction.summaryPaymentMethod.after}</strong></p>
          <p>{review.transaction.salesperson.before.name || "Tanpa sales transaksi"} → {review.transaction.salesperson.after.name || "Tanpa sales transaksi"}</p>
        </section>
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
