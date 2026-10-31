"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@pos/ui";
import { Plus, X } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import { jakartaToday } from "../helpers/supplier-payable-input";

type Payable = { id: string; supplierName: string; amount: number; paid: number; debtDate: string; dueDate: string | null; note: string | null };
type PayablePage = { items: Payable[]; page: number; total: number };
const control = "mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

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
    <dialog ref={ref} aria-labelledby={titleId} onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-surface-200 bg-white p-0 text-surface-900 shadow-xl backdrop:bg-surface-950/45">
      <header className="flex items-center justify-between border-b border-surface-200 px-5 py-4">
        <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Tutup" className="rounded-lg p-2 text-surface-500 hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-brand-500"><X className="h-5 w-5" aria-hidden="true" /></button>
      </header>
      {children}
    </dialog>
  );
}

export function SupplierPayablesPanel({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const queryClient = useQueryClient();
  const submitting = useRef(false);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<"create" | "payment" | null>(null);
  const [selected, setSelected] = useState<Payable | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [amount, setAmount] = useState("");
  const [debtDate, setDebtDate] = useState(jakartaToday);
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState("");
  const [paidAt, setPaidAt] = useState(jakartaToday);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["finance", "supplier-payables", page],
    queryFn: async () => responseJson<PayablePage>(await fetch(`/api/finance/supplier-payables?page=${page}`, { cache: "no-store" })),
  });

  function openCreate() {
    setSupplierName(""); setAmount(""); setDebtDate(jakartaToday()); setDueDate(""); setNote(""); setPayment(""); setPaidAt(jakartaToday()); setError(null); setMode("create");
  }
  function openPayment(item: Payable) {
    setSelected(item); setPayment(""); setPaidAt(jakartaToday()); setError(null); setMode("payment");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !mode || (mode === "payment" && !selected)) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const url = mode === "create" ? "/api/finance/supplier-payables" : `/api/finance/supplier-payables/${encodeURIComponent(selected!.id)}/payments`;
      const body = mode === "create"
        ? { supplierName, amount, debtDate, dueDate, note, initialPayment: payment, initialPaidAt: paidAt }
        : { amount: payment, paidAt };
      await responseJson(await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      setMode(null);
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ["finance", "supplier-payables"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Data belum dapat disimpan. Silakan coba lagi.");
    } finally { submitting.current = false; setBusy(false); }
  }

  return (
    <section aria-labelledby="supplier-payables-title" className="rounded-2xl border border-surface-200 bg-white p-3 shadow-sm sm:p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="supplier-payables-title" className="text-sm font-semibold text-surface-900">Hutang Pemasok</h2><p className="mt-1 text-xs text-surface-600">Catat hutang dan pembayarannya agar saldo masuk ke laporan bulanan.</p></div>
        {canCreate && <Button type="button" variant="secondary" onClick={openCreate} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>Tambahkan Hutang</Button>}
      </div>
      <p className="mt-2 text-xs text-surface-500">Pembayaran hutang dicatat terpisah dari pengeluaran agar tidak dihitung dua kali.</p>
      {list.isLoading ? <p className="mt-4 text-sm text-surface-500" role="status">Memuat hutang...</p> : list.isError ? <p className="mt-4 text-sm text-red-700" role="alert">Hutang belum dapat dimuat. <button type="button" onClick={() => void list.refetch()} className="underline">Coba lagi</button></p> : !list.data?.items.length ? <p className="mt-4 text-sm text-surface-500">Belum ada hutang yang dicatat.</p> : (
        <ul className="mt-3 divide-y divide-surface-100">
          {list.data.items.map(item => {
            const remaining = Math.max(0, (Math.round(item.amount * 100) - Math.round(item.paid * 100)) / 100);
            return <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0"><p className="break-words font-semibold text-surface-900">{item.supplierName}</p><p className="mt-1 text-xs text-surface-600">Tanggal {item.debtDate}{item.dueDate ? ` · Jatuh tempo ${item.dueDate}` : ""} · Dibayar {formatRupiah(item.paid)}</p>{item.note && <p className="mt-1 break-words text-xs text-surface-500">{item.note}</p>}</div>
              <div className="flex flex-wrap items-center gap-3"><span className="font-semibold tabular-nums">{remaining > 0 ? `Sisa ${formatRupiah(remaining)}` : "Lunas"}</span>{remaining > 0 && canUpdate && <button type="button" onClick={() => openPayment(item)} className="rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-surface-50 focus-visible:outline-2 focus-visible:outline-brand-500">Catat pembayaran</button>}</div>
            </li>;
          })}
        </ul>
      )}
      {!!list.data && list.data.total > 20 && <div className="mt-3 flex items-center justify-end gap-2 text-xs"><span>Halaman {page}</span><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Sebelumnya</button><button type="button" disabled={page * 20 >= list.data.total} onClick={() => setPage(value => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Berikutnya</button></div>}
      {mode && <PayableDialog title={mode === "create" ? "Tambahkan Hutang" : "Catat Pembayaran Hutang"} busy={busy} onClose={() => { if (!submitting.current) setMode(null); }}>
        <form onSubmit={event => void submit(event)} className="space-y-4 p-5" aria-busy={busy}>
          {mode === "create" ? <>
            <label className="block text-sm font-medium">Nama pemasok<input autoFocus required maxLength={200} value={supplierName} onChange={event => setSupplierName(event.target.value)} className={control} /></label>
            <label className="block text-sm font-medium">Nominal hutang (Rp)<input required type="number" min="0.01" max="9999999999.99" step="0.01" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} className={control} /></label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Tanggal hutang<input required type="date" max={jakartaToday()} value={debtDate} onChange={event => setDebtDate(event.target.value)} className={control} /></label><label className="block text-sm font-medium">Jatuh tempo (opsional)<input type="date" min={debtDate} value={dueDate} onChange={event => setDueDate(event.target.value)} className={control} /></label></div>
            <label className="block text-sm font-medium">Catatan (opsional)<textarea maxLength={1000} value={note} onChange={event => setNote(event.target.value)} className={control} rows={2} /></label>
          </> : <p className="text-sm text-surface-700">{selected?.supplierName} · Sisa {formatRupiah(Math.max(0, (selected?.amount ?? 0) - (selected?.paid ?? 0)))}</p>}
          <label className="block text-sm font-medium">{mode === "create" ? "Pembayaran awal (opsional)" : "Nominal pembayaran"} (Rp)<input autoFocus={mode === "payment"} required={mode === "payment"} type="number" min="0.01" step="0.01" max={mode === "payment" && selected ? Math.max(0, (Math.round(selected.amount * 100) - Math.round(selected.paid * 100)) / 100) : amount || undefined} inputMode="decimal" value={payment} onChange={event => setPayment(event.target.value)} className={control} /></label>
          {(payment || mode === "payment") && <label className="block text-sm font-medium">Tanggal pembayaran<input required type="date" min={mode === "create" ? debtDate : selected?.debtDate} max={jakartaToday()} value={paidAt} onChange={event => setPaidAt(event.target.value)} className={control} /></label>}
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Button type="submit" loading={busy} disabled={busy} className="w-full">{busy ? "Menyimpan..." : mode === "create" ? "Simpan hutang" : "Simpan pembayaran"}</Button>
        </form>
      </PayableDialog>}
    </section>
  );
}
