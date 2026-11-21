"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaginatedCustomers } from "@/hooks/useCustomers";
import { useDebounce } from "@/hooks/useDebounce";
import { useRole } from "@/components/providers/RoleProvider";
import { MANUAL_RECEIPT_REPORT_CATEGORIES, MANUAL_RECEIPT_REPORT_LABELS } from "@/features/keuangan/helpers/manual-report-categories";
import type { CustomerReceivable, ReceivablePaymentMethod } from "../hooks/useCustomerReceivables";

const control = "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500";
const button = "min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-50";
type Payment = CustomerReceivable["payments"][number];
const localDate = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));

export function ReceivableCorrectionForm({ entry, payment, onClose, onSaved }: { entry: CustomerReceivable; payment?: Payment; onClose: () => void; onSaved: () => void }) {
  const client = useQueryClient();
  const [expectedUpdatedAt] = useState(entry.updatedAt);
  const [amount, setAmount] = useState(String(payment?.amount ?? entry.amount));
  const [customer, setCustomer] = useState(entry.customer);
  const [customerSearch, setCustomerSearch] = useState("");
  const { canPerform, userId, storeId, authorizationFingerprint } = useRole();
  const canChooseCustomer = !payment && canPerform("customer", "read");
  const search = useDebounce(customerSearch, 300);
  const customerIdentity = JSON.stringify([userId, storeId, authorizationFingerprint]);
  const [customerScope, setCustomerScope] = useState(customerIdentity);
  const sameCustomerIdentity = customerScope === customerIdentity;
  const customerQuery = useQuery({
    queryKey: ["customers", "receivable-correction", userId, storeId, authorizationFingerprint, search],
    enabled: Boolean(canChooseCustomer && userId && storeId),
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ search, limit: "20" });
      const response = await fetch(`/api/customers?${params}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Daftar pelanggan belum dapat dimuat.");
      return response.json() as Promise<PaginatedCustomers>;
    },
  });
  useEffect(() => {
    if (!canChooseCustomer || !sameCustomerIdentity) {
      setCustomer(entry.customer);
      setCustomerSearch("");
      setCustomerScope(customerIdentity);
    }
  }, [canChooseCustomer, sameCustomerIdentity, customerIdentity, entry.customer]);
  const [debtDate, setDebtDate] = useState(entry.debtDate.slice(0, 10));
  const [dueDate, setDueDate] = useState(entry.dueDate.slice(0, 10));
  const [category, setCategory] = useState(entry.reportCategory ?? "");
  const [paidAt, setPaidAt] = useState(payment ? (payment.paidAt?.slice(0, 10) ?? localDate(payment.createdAt)) : "");
  const [method, setMethod] = useState<ReceivablePaymentMethod>(payment?.method ?? "CASH");
  const [note, setNote] = useState(payment ? payment.note ?? "" : entry.note ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const url = `/api/customer-receivables/${encodeURIComponent(entry.id)}${payment ? `/payments/${encodeURIComponent(payment.id)}` : ""}`;
      const body = payment ? { amount: Number(amount), paidAt, method, note, expectedUpdatedAt } : { ...(canChooseCustomer && sameCustomerIdentity ? { customerId: customer.id } : {}), amount: Number(amount), debtDate, dueDate, reportCategory: category, note, expectedUpdatedAt };
      const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message || "Perubahan belum dapat disimpan.");
      await Promise.all(["customers", "customer-recap", "customer-receivables", "finance"].map(key => client.invalidateQueries({ queryKey: [key] })));
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Perubahan belum dapat disimpan."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={event => void submit(event)} className="mt-3 space-y-3 rounded-lg border border-slate-200 p-3">
    <h4 className="text-sm font-semibold">{payment ? "Ubah pembayaran piutang" : "Ubah piutang"}</h4>
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">{payment ? "Nominal pembayaran piutang" : "Nominal piutang"}<input className={control} required type="number" min="0.01" max="9999999999.99" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></label>
      {payment ? <>
        <label className="text-sm font-medium">Tanggal pembayaran piutang<input className={control} required type="date" min={entry.debtDate.slice(0, 10)} value={paidAt} onChange={event => setPaidAt(event.target.value)} /></label>
        <label className="text-sm font-medium">Metode pembayaran piutang<select className={control} value={method} onChange={event => setMethod(event.target.value as ReceivablePaymentMethod)}>{[["CASH", "Tunai"], ["TRANSFER", "Transfer"], ["QRIS", "QRIS"], ["DEBIT", "Debit"], ["CREDIT", "Kartu kredit"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </> : <>
        {canChooseCustomer ? <><label className="text-sm font-medium">Cari pelanggan<input className={control} type="search" value={customerSearch} onChange={event => setCustomerSearch(event.target.value)} placeholder="Nama atau kontak pelanggan" /></label>
        <label className="text-sm font-medium">Pelanggan piutang<select className={control} value={sameCustomerIdentity ? customer.id : entry.customer.id} onChange={event => {
          const selected = customerQuery.data?.data.find(row => row.id === event.target.value);
          if (selected) setCustomer({ id: selected.id, name: selected.name });
        }}><option value={sameCustomerIdentity ? customer.id : entry.customer.id}>{sameCustomerIdentity ? customer.name : entry.customer.name}</option>{customerQuery.data?.data.filter(row => row.id !== (sameCustomerIdentity ? customer.id : entry.customer.id)).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
          {customerQuery.isFetching && <span className="mt-1 block text-xs text-slate-600">Memuat pelanggan...</span>}
          {customerQuery.isError && <span className="mt-1 block text-xs text-red-700">Daftar pelanggan belum dapat dimuat.</span>}
        </label></> : <p className="text-sm sm:col-span-2">Pelanggan piutang: {entry.customer.name}. Izin melihat pelanggan diperlukan untuk mengganti pelanggan.</p>}
        <label className="text-sm font-medium">Kategori laporan piutang<select className={control} required value={category} onChange={event => setCategory(event.target.value as typeof category)}><option value="">Pilih kategori</option>{MANUAL_RECEIPT_REPORT_CATEGORIES.map(value => <option key={value} value={value}>{MANUAL_RECEIPT_REPORT_LABELS[value]}</option>)}</select></label>
        <label className="text-sm font-medium">Tanggal piutang<input className={control} required type="date" value={debtDate} onChange={event => setDebtDate(event.target.value)} /></label>
        <label className="text-sm font-medium">Jatuh tempo piutang<input className={control} required type="date" min={debtDate} value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
      </>}
      <label className="text-sm font-medium sm:col-span-2">Catatan koreksi<input className={control} maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-2"><button className={button} type="submit" disabled={busy}>{busy ? "Menyimpan..." : payment ? "Simpan perubahan pembayaran" : "Simpan perubahan piutang"}</button><button className={button} type="button" disabled={busy} onClick={onClose}>Batal</button></div>
  </form>;
}
