"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Plus, Wallet, ChevronLeft, ChevronRight } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { CustomerReceivable, ReceivablePaymentMethod, useCreateCustomerReceivable, useCustomerReceivables, usePayCustomerReceivable } from "../hooks/useCustomerReceivables";

const inputClass = "min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-red-500";
const primaryClass = "min-h-11 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50";
const secondaryClass = "min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-50";
const methods: { value: ReceivablePaymentMethod; label: string }[] = [{ value: "CASH", label: "Tunai" }, { value: "TRANSFER", label: "Transfer" }, { value: "QRIS", label: "QRIS" }, { value: "DEBIT", label: "Debit" }, { value: "CREDIT", label: "Kartu kredit" }];
const money = (value: number | string) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value));
const date = (value: string) => new Date(value).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" });
const isValidAmount = (value: string) => /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number(value) <= 9999999999.99;
function todayWib() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function ReceivableForm({ customerId, onClose, onSaved }: { customerId: string; onClose: () => void; onSaved: () => void }) {
  const mutation = useCreateCustomerReceivable();
  const id = useId();
  const [amount, setAmount] = useState("");
  const [debtDate, setDebtDate] = useState(todayWib);
  const [dueDate, setDueDate] = useState(todayWib);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const form = useRef<HTMLFormElement>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!isValidAmount(amount)) next.amount = "Isi nominal lebih dari 0, maksimal Rp 9.999.999.999,99 dengan paling banyak 2 angka desimal.";
    if (!validDate(debtDate) || debtDate > todayWib()) next.debtDate = "Tanggal utang harus valid dan tidak boleh melewati hari ini.";
    if (!validDate(dueDate) || dueDate < debtDate) next.dueDate = "Tanggal jatuh tempo harus sama atau setelah tanggal utang.";
    setErrors(next); setError("");
    if (Object.keys(next).length) { form.current?.querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)?.focus(); return; }
    try { await mutation.mutateAsync({ customerId, amount: Number(amount), debtDate, dueDate, ...(note.trim() ? { note: note.trim() } : {}) }); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : "Piutang belum berhasil disimpan."); }
  }
  const clear = (field: string) => { setErrors(current => ({ ...current, [field]: "" })); setError(""); };
  return <form ref={form} onSubmit={submit} noValidate
    className="mt-4 space-y-4 rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
    <p
      className="text-sm font-bold text-slate-900">Tambah Piutang</p>
    <fieldset
      disabled={mutation.isPending}
      className="grid min-w-0 gap-4 sm:grid-cols-2">
      <div
        className="sm:col-span-2">
        <label
          htmlFor={`${id}-amount`}
          className="mb-1 block text-sm font-semibold text-slate-700">Nominal piutang</label>
        <input autoFocus
          id={`${id}-amount`}
          name="amount"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={e => { setAmount(e.target.value); clear("amount"); }}
          className={inputClass}
          aria-invalid={!!errors.amount}
          aria-describedby={errors.amount ? `${id}-amount-error` : undefined} />{errors.amount && <p
            id={`${id}-amount-error`}
            className="mt-1 text-sm text-red-700">{errors.amount}</p>}</div>
      <div>
        <label
          htmlFor={`${id}-debt-date`}
          className="mb-1 block text-sm font-semibold text-slate-700">Tanggal utang</label>
        <input
          id={`${id}-debt-date`}
          name="debtDate"
          type="date"
          max={todayWib()}
          value={debtDate}
          onChange={e => { setDebtDate(e.target.value); clear("debtDate"); }}
          className={inputClass}
          aria-invalid={!!errors.debtDate}
          aria-describedby={errors.debtDate ? `${id}-debt-error` : undefined} />{errors.debtDate && <p
            id={`${id}-debt-error`}
            className="mt-1 text-sm text-red-700">{errors.debtDate}</p>}</div>
      <div>
        <label
          htmlFor={`${id}-due-date`}
          className="mb-1 block text-sm font-semibold text-slate-700">Tanggal jatuh tempo</label>
        <input
          id={`${id}-due-date`}
          name="dueDate"
          type="date"
          min={debtDate}
          value={dueDate}
          onChange={e => { setDueDate(e.target.value); clear("dueDate"); }}
          className={inputClass}
          aria-invalid={!!errors.dueDate}
          aria-describedby={errors.dueDate ? `${id}-due-error` : undefined} />{errors.dueDate && <p
            id={`${id}-due-error`}
            className="mt-1 text-sm text-red-700">{errors.dueDate}</p>}</div>
      <div
        className="sm:col-span-2">
        <label
          htmlFor={`${id}-note`}
          className="mb-1 block text-sm font-semibold text-slate-700">Catatan (opsional)</label>
        <textarea
          id={`${id}-note`}
          maxLength={500}
          value={note}
          onChange={e => { setNote(e.target.value); setError(""); }}
          className={inputClass}
          rows={2} />
      </div>
    </fieldset>
    {(error || Object.values(errors).some(Boolean)) && <p role="alert"
      className="text-sm font-semibold text-red-700">{error || "Periksa kembali kolom yang ditandai."}</p>}
    <div
      className="flex flex-wrap gap-2">
      <button
        type="submit"
        disabled={mutation.isPending}
        className={primaryClass}>{mutation.isPending ? "Menyimpan..." : "Simpan Piutang"}</button>
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={onClose}
        className={secondaryClass}>Batal</button>
    </div>
  </form>;
}

function ReceivablePaymentForm({ entry, onSaved, onClose }: { entry: CustomerReceivable; onSaved: () => void; onClose: () => void }) {
  const mutation = usePayCustomerReceivable(entry.id);
  const id = useId();
  const remaining = Math.max(0, Number(entry.amount) - Number(entry.amountPaid));
  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState<ReceivablePaymentMethod>("CASH");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [amountError, setAmountError] = useState(false);
  const amountInput = useRef<HTMLInputElement>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setAmountError(false);
    if (!isValidAmount(amount) || Number(amount) > remaining) { setAmountError(true); setError("Nominal pembayaran harus lebih dari 0, paling banyak 2 angka desimal, dan tidak melebihi sisa piutang."); amountInput.current?.focus(); return; }
    try { await mutation.mutateAsync({ amount: Number(amount), method, ...(note.trim() ? { note: note.trim() } : {}) }); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : "Pembayaran belum berhasil dicatat."); }
  }
  return <form onSubmit={submit} noValidate
    className="mt-4 space-y-3 border-t border-slate-200 pt-4">
    <fieldset
      disabled={mutation.isPending}
      className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div>
        <label
          htmlFor={`${id}-amount`}
          className="mb-1 block text-sm font-semibold text-slate-700">Nominal pembayaran</label>
        <input autoFocus ref={amountInput}
          id={`${id}-amount`}
          type="number"
          min="0.01"
          max={remaining}
          step="0.01"
          value={amount}
          onChange={e => { setAmount(e.target.value); setAmountError(false); setError(""); }}
          className={inputClass}
          aria-invalid={amountError}
          aria-describedby={error ? `${id}-error` : undefined} />
      </div>
      <div>
        <label
          htmlFor={`${id}-method`}
          className="mb-1 block text-sm font-semibold text-slate-700">Metode pembayaran</label>
        <select
          id={`${id}-method`}
          value={method}
          onChange={e => { setMethod(e.target.value as ReceivablePaymentMethod); setError(""); }}
          className={inputClass}>{methods.map(option => <option key={option.value}
            value={option.value}>{option.label}</option>)}</select>
      </div>
      <div
        className="sm:col-span-2">
        <label
          htmlFor={`${id}-note`}
          className="mb-1 block text-sm font-semibold text-slate-700">Catatan pembayaran (opsional)</label>
        <input
          id={`${id}-note`}
          value={note}
          maxLength={500}
          onChange={e => { setNote(e.target.value); setError(""); }}
          className={inputClass} />
      </div>
    </fieldset>
    {error && <p
      id={`${id}-error`} role="alert"
      className="text-sm font-semibold text-red-700">{error}</p>}
    <div
      className="flex flex-wrap gap-2">
      <button
        type="submit"
        disabled={mutation.isPending}
        className={primaryClass}>{mutation.isPending ? "Menyimpan..." : "Simpan Pembayaran"}</button>
      <button
        type="button"
        disabled={mutation.isPending}
        className={secondaryClass}
        onClick={onClose}>Batal</button>
    </div>
  </form>;
}

function ReceivableCard({ entry, canPay }: { entry: CustomerReceivable; canPay: boolean }) {
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState("");
  const remaining = Math.max(0, Number(entry.amount) - Number(entry.amountPaid));
  const overdue = remaining > 0 && entry.dueDate.slice(0, 10) < todayWib();
  return <article
    className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
    <div
      className="flex flex-wrap items-start justify-between gap-3">
      <div
        className="min-w-0">
        <p
          className="break-words text-sm font-bold text-slate-900">{entry.customer.name}</p>
        <p
          className="mt-1 text-xs font-semibold text-slate-500">Piutang manual · {date(entry.debtDate)}</p>
      </div>
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-bold ${remaining <= 0 ? "bg-emerald-50 text-emerald-700" : overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{remaining <= 0 ? "Lunas" : overdue ? "Lewat jatuh tempo" : "Belum lunas"}</span>
    </div>
    <dl
      className="mt-4 grid min-w-0 grid-cols-2 gap-3 text-sm">
      <div>
        <dt
          className="text-xs text-slate-500">Sisa piutang</dt>
        <dd
          className="mt-1 break-words text-lg font-black text-slate-900">{money(remaining)}</dd>
      </div>
      <div>
        <dt
          className="text-xs text-slate-500">Jatuh tempo</dt>
        <dd
          className="mt-1 font-semibold text-slate-700">{date(entry.dueDate)}</dd>
      </div>
      <div>
        <dt
          className="text-xs text-slate-500">Nominal awal</dt>
        <dd
          className="mt-1 break-words font-semibold text-slate-700">{money(entry.amount)}</dd>
      </div>
      <div>
        <dt
          className="text-xs text-slate-500">Sudah dibayar</dt>
        <dd
          className="mt-1 break-words font-semibold text-emerald-700">{money(entry.amountPaid)}</dd>
      </div>
    </dl>
    {entry.note && <p
      className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{entry.note}</p>}
    {entry.payments.length > 0 && <details
      className="mt-3 text-sm">
      <summary
        className="min-h-11 cursor-pointer py-3 font-semibold text-slate-700">Riwayat pembayaran</summary>
      <ul
        className="space-y-2">{entry.payments.map(payment => <li key={payment.id}
          className="rounded-xl bg-slate-50 p-3">
          <p
            className="flex flex-wrap justify-between gap-2">
            <span
              className="font-bold text-slate-900">{money(payment.amount)}</span>
            <span
              className="text-slate-600">{methods.find(method => method.value === payment.method)?.label ?? payment.method} · {date(payment.createdAt)}</span>
          </p>{payment.note && <p
            className="mt-1 break-words text-slate-600">{payment.note}</p>}</li>)}</ul>
    </details>}
    <p role="status"
      className="mt-2 text-sm font-semibold text-emerald-700">{success}</p>
    {canPay && remaining > 0 && !paying && <button
      type="button"
      onClick={() => { setPaying(true); setSuccess(""); }}
      className={`${secondaryClass} mt-3`}>Bayar Piutang Manual</button>}
    {canPay && paying && <ReceivablePaymentForm entry={entry} onClose={() => setPaying(false)} onSaved={() => { setPaying(false); setSuccess("Pembayaran berhasil dicatat."); }} />}
  </article>;
}

export function CustomerReceivablesSection({ customerId, customerName, canAdd = true, canPay = true }: { customerId?: string; customerName?: string; canAdd?: boolean; canPay?: boolean }) {
  const titleId = useId();
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"open" | "all">(customerId ? "all" : "open");
  const [success, setSuccess] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const query = useCustomerReceivables({ customerId, page, search: debouncedSearch, status });
  const totalPages = query.data?.pagination.totalPages;
  useEffect(() => {
    if (totalPages !== undefined && page > Math.max(1, totalPages)) {
      setPage(Math.max(1, totalPages));
    }
  }, [page, totalPages]);
  return <section aria-labelledby={titleId}
    className="min-w-0 rounded-3xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
    <div
      className="flex flex-wrap items-start justify-between gap-3">
      <div
        className="min-w-0">
        <h3
          id={titleId}
          className="flex items-center gap-2 text-base font-black text-slate-900">
          <Wallet aria-hidden="true"
            className="h-5 w-5 text-brand-600" />Piutang Manual</h3>
        <p
          className="mt-1 max-w-xl text-sm leading-6 text-slate-600">Catat piutang lama atau tagihan di luar kasir{customerName ? ` untuk ${customerName}` : ""}. Catatan ini tidak menambah penjualan, order, atau mengubah stok.</p>
      </div>{customerId && canAdd && !adding && <button
        type="button"
        onClick={() => { setAdding(true); setSuccess(""); }}
        className={`${primaryClass} inline-flex items-center gap-2`}>
        <Plus aria-hidden="true"
          className="h-4 w-4" />Tambah Piutang</button>}</div>
    <p role="status"
      className="mt-2 text-sm font-semibold text-emerald-700">{success}</p>
    {customerId && canAdd && adding && <ReceivableForm customerId={customerId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setPage(1); setStatus("all"); setSuccess("Piutang berhasil dicatat."); }} />}
    <div
      className="mt-4 flex flex-col gap-3 sm:flex-row">{!customerId && <input
        type="search"
        aria-label="Cari piutang manual" placeholder="Cari nama pelanggan atau catatan..."
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        className={`${inputClass} flex-1`} />}<select
          aria-label="Status piutang manual"
          value={status}
          onChange={e => { setStatus(e.target.value as "open" | "all"); setPage(1); }}
          className={`${inputClass} sm:w-auto`}>
        <option
          value="open">Belum lunas</option>
        <option
          value="all">Semua piutang</option>
      </select>
    </div>
    {query.isLoading ? <p role="status"
      className="py-8 text-center text-sm text-slate-600">Memuat piutang manual...</p> : query.isError ? <div role="alert"
        className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
        <p
          className="text-sm text-red-700">Piutang manual belum bisa dimuat.</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className={`${secondaryClass} mt-2`}>Coba lagi</button>
      </div> : <div
        className="mt-4 space-y-3">{query.data?.data.length ? query.data.data.map(entry => <ReceivableCard key={entry.id} entry={entry} canPay={canPay} />) : <p
          className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">{status === "open" ? "Tidak ada piutang manual yang belum lunas." : "Belum ada piutang manual."}</p>}</div>}
    {query.data && query.data.pagination.totalPages > 1 && <nav
      aria-label="Halaman piutang manual"
      className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <p
        className="text-xs font-semibold text-slate-600">Halaman {query.data.pagination.page} dari {query.data.pagination.totalPages}</p>
      <div
        className="flex gap-2">
        <button
          type="button"
          aria-label="Halaman sebelumnya"
          disabled={page <= 1 || query.isFetching}
          onClick={() => setPage(current => current - 1)}
          className={secondaryClass}>
          <ChevronLeft aria-hidden="true"
            className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Halaman berikutnya"
          disabled={page >= query.data.pagination.totalPages || query.isFetching}
          onClick={() => setPage(current => current + 1)}
          className={secondaryClass}>
          <ChevronRight aria-hidden="true"
            className="h-4 w-4" />
        </button>
      </div>
    </nav>}
  </section>;
}
