"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@pos/ui";
import { Decimal } from "@pos/db/decimal";
import { X } from "lucide-react";
import { formatRupiahPrecise } from "@/lib/utils";
import type { ExpenseCorrectionAction } from "../helpers/expense-correction-actions";
import type { ExpenseCorrectionPreviewInput } from "../helpers/expense-correction-input";
import type { ExpensePaymentDisposition, ExpensePaymentToSettle } from "../helpers/expense-correction-settlement";
import type { loadExpenseCorrectionEditor, previewExpenseCorrection } from "../services/expense-correction-service";
import styles from "./ExpenseCorrectionPanel.module.css";

type Editor = Awaited<ReturnType<typeof loadExpenseCorrectionEditor>>;
type Review = Awaited<ReturnType<typeof previewExpenseCorrection>>;
type Draft = ExpenseCorrectionPreviewInput["draft"];
type GoodsEditor = Extract<Editor, { kind: "goods" }>["editor"];
type Supplier = Editor["suppliers"][number];

const endpoint = "/api/finance/expense-corrections";
const field = "block min-h-11 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";
const money = (amountCents: number) => formatRupiahPrecise(amountCents / 100);
const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const amountCents = (data: FormData, key: string) => new Decimal(value(data, key)).mul(100).toNumber();
const message = (error: unknown) => error instanceof Error ? error.message : "Koreksi belum dapat diproses.";

async function loadData<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.data) throw new Error(result?.message ?? "Data koreksi belum tersedia.");
  return result.data as T;
}

function post<T>(url: string, body: unknown) {
  return loadData<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function draftFor(record: Editor, cancelling: boolean, data: FormData): Draft {
  const reason = value(data, "reason");
  let changes: Record<string, unknown> | undefined;
  const dispositions: ExpensePaymentDisposition[] = [];
  if (cancelling) {
    for (const [index, payment] of record.payments.entries()) {
      const method = value(data, `settle-${index}`);
      const details = { paymentId: payment.id, amountCents: payment.amountCents, reference: value(data, `reference-${index}`) };
      if (method === "refund") dispositions.push({ ...details, kind: "refund", date: value(data, `refund-date-${index}`) });
      if (method === "credit") dispositions.push({ ...details, kind: "credit", supplierId: value(data, `supplier-${index}`) });
      if (method === "entryError") dispositions.push({ ...details, kind: "entryError" });
    }
  } else if (record.payment) {
    changes = { amountCents: amountCents(data, "amount"), paidAt: value(data, "date") };
  } else if (record.kind === "backdated") {
    changes = {
      reference: value(data, "reference"),
      purchaseDate: value(data, "date"),
      amountCents: amountCents(data, "amount"),
      ...(record.editor.paymentMethod === "GIRO" ? { dueDate: value(data, "dueDate") } : {}),
    };
  } else {
    const { editor } = record;
    const items = editor.items.map((item, index) => ({
      ...item,
      orderedQty: Number(value(data, `qty-${index}`)),
      unitPrice: new Decimal(value(data, `price-${index}`)).toFixed(2),
      receipts: item.receipts.map((row, receiptIndex) => ({
        ...row, receivedQty: Number(value(data, `receipt-${index}-${receiptIndex}`)),
      })),
    }));
    const hasReceipts = items.some(item => item.receipts.length > 0);
    const total = items.reduce((sum, item) => {
      const quantity = hasReceipts
        ? item.receipts.reduce((count, receipt) => count.add(receipt.receivedQty), new Decimal(0))
        : item.orderedQty;
      return sum.add(new Decimal(item.unitPrice).mul(quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
    }, new Decimal(0));
    const schedule = editor.payment.schedule?.map((row, index, rows) => ({
      ...row,
      amount: rows.length === 1 ? total.toFixed(2) : new Decimal(value(data, `schedule-${index}`)).toFixed(2),
      dueDate: row.method === "GIRO" ? value(data, `schedule-date-${index}`) : null,
    }));
    changes = {
      expectedVersion: editor.version,
      header: { ...editor.header, name: value(data, "name"), businessDate: value(data, "date"), note: value(data, "note") || null },
      items, payment: {
        method: editor.payment.method,
        dueDate: schedule?.length ? editor.payment.dueDate : value(data, "dueDate") || null,
        ...(schedule?.length ? { schedule } : {}), allocations: editor.payment.allocations, corrections: [],
      },
    };
  }
  return { reason, changes, dispositions };
}

export function ExpenseCorrectionPanel({ action, record, onClose, onSaved }: {
  action: ExpenseCorrectionAction;
  record: { name: string; reference: string; amount: number; sourceLabel: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const formId = useId();
  const headingId = useId();
  const { subject, operation } = action;
  const cancelling = operation === "cancel";
  const payment = "payment" in subject ? subject.payment : undefined;
  const params = new URLSearchParams({ operation, type: subject.type, id: subject.id });
  if (payment) {
    params.set("paymentKind", payment.kind);
    params.set("paymentId", payment.id);
  }
  const url = `${endpoint}?${params}`;
  const loaded = useQuery({
    queryKey: ["finance", "expense-correction", url],
    queryFn: ({ signal }) => loadData<Editor>(url, { signal }),
    gcTime: 0,
    retry: false,
  });
  const [review, setReview] = useState<{ data: Review; draft: Draft; requestId: string } | null>(null);
  const [formError, setFormError] = useState<string>();
  const preview = useMutation({
    mutationFn: (draft: Draft) => post<Review>(`${endpoint}/preview`, { subject, operation, draft }),
    onSuccess: (data, draft) => setReview({ data, draft, requestId: crypto.randomUUID() }),
  });
  const save = useMutation({
    mutationFn: (selected: NonNullable<typeof review>) => post<{ auditId: string }>(endpoint, {
      subject, operation, draft: selected.draft, version: selected.data.version, requestId: selected.requestId,
    }),
    onSuccess: () => { onClose(); onSaved(); },
  });
  const busy = preview.isPending || save.isPending;
  const currentAmount = loaded.data?.payment ? loaded.data.payment.amountCents / 100 :
    loaded.data?.kind === "backdated" ? loaded.data.editor.amountCents / 100 :
      loaded.data?.kind === "goods" ? Number(loaded.data.editor.totalAmount) : record.amount;
  const error = formError ?? (preview.error || save.error || loaded.error ? message(preview.error ?? save.error ?? loaded.error) : null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);
  useEffect(() => { if (review) heading.current?.focus(); }, [review]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !loaded.data) return;
    setFormError(undefined);
    save.reset();
    try {
      preview.mutate(draftFor(loaded.data, cancelling, new FormData(event.currentTarget)));
    } catch {
      setFormError("Periksa nominal dan rincian yang diisi.");
    }
  }

  function goBack() {
    if (review) { setReview(null); save.reset(); preview.reset(); }
    else onClose();
  }

  return <dialog ref={dialog} aria-labelledby={headingId} className={`${styles.panel} rounded-none border-0 bg-white text-surface-900 shadow-2xl sm:rounded-l-2xl`}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="border-b border-surface-200 px-4 py-3 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id={headingId} ref={heading} tabIndex={-1} className="text-xl font-bold tracking-tight">{action.label}</h2>
        <button type="button" aria-label="Tutup panel koreksi" disabled={busy} onClick={onClose}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-surface-500 hover:bg-surface-100 focus-visible:ring-2 focus-visible:ring-brand-500"><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border-l-4 border-violet-600 bg-violet-50 p-3 text-sm">
        <div className="min-w-0"><p className="break-words font-semibold">{record.name}</p><p className="text-xs text-surface-600">{record.reference} · {record.sourceLabel}</p></div>
        <strong className="shrink-0 tabular-nums text-red-700">{formatRupiahPrecise(currentAmount)}</strong>
      </div>
    </header>
    <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
      {loaded.isPending && <p role="status" className="text-sm text-surface-600">Memuat transaksi…</p>}
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}
        {loaded.isError && <button type="button" className="ml-2 underline" onClick={() => void loaded.refetch()}>Coba lagi</button>}</div>}
      {loaded.data && <form id={formId} onSubmit={submit} hidden={Boolean(review)} className="space-y-4 text-sm">
        {cancelling
          ? loaded.data.payments.map((entry, index) => <PaymentSettlementFields key={entry.id} entry={entry} index={index} suppliers={loaded.data!.suppliers} />)
          : <EditFields record={loaded.data} />}
        <label className="block space-y-1 font-medium">
          <span>{cancelling ? "Alasan pembatalan" : "Alasan koreksi"}</span>
          <textarea name="reason" required maxLength={500} rows={2} className={field} />
        </label>
      </form>}
      {review && <CorrectionImpact review={review.data} cancelling={cancelling} />}
    </div>
    <footer className={`${styles.footer} flex justify-end gap-2 border-t border-surface-200 px-4 pt-3 sm:px-5`}>
      <Button type="button" variant="secondary" disabled={busy} onClick={goBack}>{review ? "Kembali" : "Tutup"}</Button>
      {review
        ? <Button type="button" variant={cancelling ? "danger" : "primary"} className="flex-1 sm:flex-none"
          disabled={busy || review.data.blockers.length > 0} onClick={() => save.mutate(review)}>
          {save.isPending ? "Menyimpan…" : cancelling ? action.label : "Simpan perubahan"}
        </Button>
        : <Button type="submit" form={formId} className="flex-1 sm:flex-none" disabled={busy || !loaded.data}>
          {preview.isPending ? "Memeriksa…" : cancelling ? "Tinjau pembatalan" : "Tinjau perubahan"}
        </Button>}
    </footer>
  </dialog>;
}

function EditFields({ record }: { record: Editor }) {
  if (record.payment) return <>
    <label className="block">Nominal pembayaran<input className={field} name="amount" type="number" min="0.01" step="0.01" required defaultValue={record.payment.amountCents / 100} /></label>
    <label className="block">Tanggal pembayaran<input className={field} name="date" type="date" required defaultValue={record.payment.paidAt} /></label>
  </>;
  if (record.kind === "backdated") return <>
    <label className="block">Referensi<input className={field} name="reference" maxLength={160} required defaultValue={record.editor.reference} /></label>
    <label className="block">Tanggal pembelian<input className={field} name="date" type="date" required defaultValue={record.editor.purchaseDate} /></label>
    {record.editor.paymentMethod === "GIRO" && <label className="block">Jatuh tempo<input className={field} name="dueDate" type="date" required defaultValue={record.editor.dueDate} /></label>}
    <label className="block">Nilai pembelian<input className={field} name="amount" type="number" min="0.01" step="0.01" required defaultValue={record.editor.amountCents / 100} /></label>
  </>;
  return <GoodsFields editor={record.editor} />;
}

function GoodsFields({ editor }: { editor: GoodsEditor }) {
  return <>
    <label className="block">Nama daftar belanja<input className={field} name="name" maxLength={200} required defaultValue={editor.header.name} /></label>
    <label className="block">Tanggal pembelian<input className={field} name="date" type="date" required defaultValue={editor.header.businessDate} /></label>
    <label className="block">Catatan<textarea className={field} name="note" rows={2} maxLength={5000} defaultValue={editor.header.note ?? ""} /></label>
    <fieldset className="space-y-2"><legend className="font-semibold">Produk</legend>
      {editor.items.map((item, index) => <div key={item.clientLineKey} className="space-y-2 border-b border-surface-200 py-2">
        <p className="font-medium">{item.productName} {item.unit && <span className="text-surface-500">· {item.unit}</span>}</p>
        <div className="grid grid-cols-2 gap-2">
          <label>Jumlah dipesan<input className={field} name={`qty-${index}`} type="number" min="0" step="any" required defaultValue={item.orderedQty} /></label>
          <label>Harga per satuan<input className={field} name={`price-${index}`} type="number" min="0" step="0.01" required defaultValue={item.unitPrice} /></label>
        </div>
        {item.receipts.length > 0 && <details className="rounded-lg bg-surface-50 p-2">
          <summary className="cursor-pointer font-medium">Rincian penerimaan</summary>
          {item.receipts.map((receipt, row) => <label key={receipt.receiptLineId ?? row} className="mt-2 block">
            Jumlah diterima {item.receipts.length > 1 ? row + 1 : ""}<input className={field} name={`receipt-${index}-${row}`} type="number" min="0" step="any" required defaultValue={receipt.receivedQty} />
          </label>)}
        </details>}
      </div>)}
    </fieldset>
    {editor.payment.schedule?.map((row, index, rows) => <div key={index} className="grid grid-cols-2 gap-2">
      {rows.length > 1 && <label>Nominal jadwal {index + 1}<input className={field} name={`schedule-${index}`} type="number" min="0" step="0.01" required defaultValue={row.amount} /></label>}
      {row.method === "GIRO" && <label>Jatuh tempo giro {index + 1}<input className={field} name={`schedule-date-${index}`} type="date" required defaultValue={row.dueDate ?? ""} /></label>}
    </div>)}
    {!editor.payment.schedule?.length && editor.payment.method === "GIRO" && <label className="block">Jatuh tempo giro<input className={field} name="dueDate" type="date" required defaultValue={editor.payment.dueDate ?? ""} /></label>}
  </>;
}

function PaymentSettlementFields({ entry, index, suppliers }: { entry: ExpensePaymentToSettle; index: number; suppliers: Supplier[] }) {
  const [method, setMethod] = useState("");
  return <fieldset className="space-y-2 rounded-lg border border-surface-200 p-3">
    <legend className="px-1 font-semibold">Pembayaran {index + 1} · {money(entry.amountCents)}</legend>
    <p className="text-xs text-surface-600">{entry.paidAt}</p>
    <label className="block">Penyelesaian pembayaran<select className={field} name={`settle-${index}`} value={method} onChange={event => setMethod(event.target.value)}>
      <option value="">Belum diselesaikan</option>
      <option value="refund">Dana sudah dikembalikan</option>
      {suppliers.length > 0 && <option value="credit">Kredit pemasok dikonfirmasi</option>}
      <option value="entryError">Salah catat, tanpa uang keluar</option>
    </select></label>
    {method === "refund" && <label className="block">Tanggal dana diterima<input className={field} name={`refund-date-${index}`} type="date" min={entry.paidAt} required /></label>}
    {method === "credit" && <label className="block">Pemasok<select className={field} name={`supplier-${index}`} defaultValue={suppliers.length === 1 ? suppliers[0].id : ""} required>
      <option value="">Pilih pemasok</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
    </select></label>}
    {method && <label className="block">{method === "entryError" ? "Keterangan salah catat" : "Referensi penyelesaian"}
      <input className={field} name={`reference-${index}`} maxLength={160} required />
    </label>}
  </fieldset>;
}

function CorrectionImpact({ review, cancelling }: { review: Review; cancelling: boolean }) {
  const { before, after, stockMovements } = review.impact;
  const rows = [
    ["Nilai pembelian", before.amountCents, after.amountCents],
    ["Pembayaran aktif", before.paidCents, after.paidCents],
    ["Sisa utang", before.remainingCents, after.remainingCents],
  ] as const;
  const beforeCredit = "creditCents" in before ? Number(before.creditCents) : 0;
  const afterCredit = "creditCents" in after ? Number(after.creditCents) : 0;
  const displayRows = beforeCredit || afterCredit ? [...rows, ["Kredit pemasok terpakai", beforeCredit, afterCredit] as const] : rows;
  return <section className="space-y-3 text-sm">
    <h3 className="text-base font-semibold">{cancelling ? "Dampak pembatalan" : "Dampak perubahan"}</h3>
    <table className="w-full border-collapse text-xs sm:text-sm">
      <thead className="text-surface-600"><tr><th scope="col" className="py-2 text-left">Keuangan</th><th scope="col" className="px-2 py-2 text-right">Sebelum</th><th scope="col" className="px-2 py-2 text-right">Sesudah</th></tr></thead>
      <tbody>{displayRows.map(([label, oldValue, newValue]) => <tr key={label} className="border-t border-surface-200">
        <th scope="row" className="py-2 text-left font-medium">{label}</th>
        <td className="whitespace-nowrap px-2 text-right tabular-nums">{money(oldValue)}</td>
        <td className="whitespace-nowrap bg-brand-50 px-2 text-right font-semibold tabular-nums">{money(newValue)}</td>
      </tr>)}</tbody>
    </table>
    {stockMovements.length > 0 && <details className="rounded-lg border border-surface-200 p-3">
      <summary className="cursor-pointer font-semibold">Rincian stok · {stockMovements.length} produk</summary>
      <ul className="mt-2 space-y-1">{stockMovements.map((move, index) => <li key={`${move.productId}-${index}`} className="flex justify-between gap-2">
        <span>{"productName" in move ? String(move.productName) : move.productId}</span>
        <span className="tabular-nums">{"baseQuantity" in move ? -Number(move.baseQuantity) : move.baseDelta} {move.unit ?? ""}</span>
      </li>)}</ul>
    </details>}
    {review.blockers.length > 0 && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
      <p className="font-semibold">Koreksi belum dapat disimpan</p>
      <ul className="mt-1 list-inside list-disc">{review.blockers.map((blocker, index) => <li key={index}>{blocker.message}</li>)}</ul>
    </div>}
  </section>;
}
