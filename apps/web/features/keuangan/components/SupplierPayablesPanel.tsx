"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@pos/ui";
import { Plus, X } from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import { jakartaToday } from "../helpers/supplier-payable-input";
import { GiroPanel } from "./GiroPanel";

type Payable = { id: string; supplierName: string; amount: number; paid: number; debtDate: string; dueDate: string | null; note: string | null };
type PayablePage = { items: Payable[]; page: number; total: number };
const control = "mt-1.5 min-h-11 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-base text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 sm:text-sm";
const payableCurrency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const formatRupiah = (amount: number) => payableCurrency.format(amount);

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
        <div><h2 id={titleId} className="text-lg font-semibold">{title}</h2><p className="mt-1 text-xs leading-relaxed text-surface-500">{title === "Tambahkan Hutang" ? "Catat rincian hutang pemasok dan pembayaran awal jika ada." : "Catat pembayaran untuk mengurangi sisa hutang."}</p></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Tutup" className="rounded-lg p-2 text-surface-500 hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-brand-500"><X className="h-5 w-5" aria-hidden="true" /></button>
      </header>
      {children}
    </dialog>
  );
}

export function SupplierPayablesPanel({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const { userId, storeId, authorizationFingerprint } = useRole();
  const identity = JSON.stringify([storeId, userId, authorizationFingerprint, canCreate, canUpdate]);
  return <SupplierPayablesPanelState key={identity} userId={userId} storeId={storeId} authorizationFingerprint={authorizationFingerprint} canCreate={canCreate} canUpdate={canUpdate} />;
}

function SupplierPayablesPanelState({ userId, storeId, authorizationFingerprint, canCreate, canUpdate }: { userId: string | null; storeId: string | null; authorizationFingerprint: string | null; canCreate: boolean; canUpdate: boolean }) {
  const queryClient = useQueryClient();
  const submitting = useRef(false);
  const active = useRef(false);
  const requestController = useRef<AbortController | null>(null);
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

  useLayoutEffect(() => {
    active.current = true;
    const controller = new AbortController();
    requestController.current = controller;
    return () => { active.current = false; controller.abort(); };
  }, []);

  const list = useQuery({
    queryKey: ["finance", "supplier-payables", storeId, userId, authorizationFingerprint, page],
    enabled: Boolean(storeId && userId),
    queryFn: async ({ signal }) => responseJson<PayablePage>(await fetch(`/api/finance/supplier-payables?page=${page}`, { cache: "no-store", signal })),
  });

  function openCreate() {
    setSupplierName(""); setAmount(""); setDebtDate(jakartaToday()); setDueDate(""); setNote(""); setPayment(""); setPaidAt(jakartaToday()); setError(null); setMode("create");
  }
  function openPayment(item: Payable) {
    setSelected(item); setPayment(""); setPaidAt(jakartaToday()); setError(null); setMode("payment");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const controller = requestController.current;
    if (!active.current || !controller || controller.signal.aborted || submitting.current || !mode || (mode === "create" && !canCreate) || (mode === "payment" && (!canUpdate || !selected))) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const url = mode === "create" ? "/api/finance/supplier-payables" : `/api/finance/supplier-payables/${encodeURIComponent(selected!.id)}/payments`;
      const body = mode === "create"
        ? { supplierName, amount, debtDate, dueDate, note, initialPayment: payment, initialPaidAt: paidAt }
        : { amount: payment, paidAt };
      await responseJson(await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal }));
      if (!active.current) return;
      setMode(null);
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : "Data belum dapat disimpan. Silakan coba lagi.");
    } finally { submitting.current = false; if (active.current) setBusy(false); }
  }

  return (
    <section aria-labelledby="supplier-payables-title" className="rounded-2xl border border-surface-200 bg-white p-3 shadow-sm sm:p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="supplier-payables-title" className="text-sm font-semibold text-surface-900">Hutang Pemasok</h2><p className="mt-1 text-xs text-surface-600">Catat hutang dan pembayarannya agar saldo masuk ke laporan bulanan.</p></div>
        {canCreate && <Button type="button" variant="secondary" onClick={openCreate} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>Tambahkan Hutang</Button>}
      </div>
      <p className="mt-2 text-xs text-surface-500">Pembayaran hutang dicatat terpisah dari pengeluaran agar tidak dihitung dua kali.</p>
      {list.isLoading ? <p className="mt-4 text-sm text-surface-500" role="status">Memuat hutang...</p> : list.isError ? <p className="mt-4 text-sm text-red-700" role="alert">Hutang belum dapat dimuat. <button type="button" onClick={() => void list.refetch()} className="underline">Coba lagi</button></p> : !list.data?.items.length ? <p className="mt-4 text-sm text-surface-500">{page > 1 ? "Tidak ada hutang pada halaman ini." : "Belum ada hutang yang dicatat."}</p> : (
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
      {!!list.data && (list.data.total > 20 || page > 1) && <div className="mt-3 flex items-center justify-end gap-2 text-xs"><span>Halaman {page}</span><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Sebelumnya</button><button type="button" disabled={page * 20 >= list.data.total} onClick={() => setPage(value => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Berikutnya</button></div>}
      <GiroPanel canUpdate={canUpdate} />
      {mode && <PayableDialog title={mode === "create" ? "Tambahkan Hutang" : "Catat Pembayaran Hutang"} busy={busy} onClose={() => { if (!submitting.current) setMode(null); }}>
        <form onSubmit={event => void submit(event)} className="flex min-h-0 flex-col overflow-hidden" aria-busy={busy}>
          <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5">
            {mode === "create" ? <>
              <section aria-labelledby="payable-details-title" className="space-y-4">
                <div><h3 id="payable-details-title" className="text-sm font-semibold text-surface-900">Rincian hutang</h3><p className="mt-1 text-xs text-surface-500">Isi data yang tercantum pada tagihan pemasok.</p></div>
                <label className="block text-sm font-medium">Nama pemasok <span className="text-red-500">*</span><input autoFocus required maxLength={200} placeholder="Contoh: Toko Sumber Jaya" value={supplierName} onChange={event => setSupplierName(event.target.value)} className={control} /></label>
                <label className="block text-sm font-medium">Nominal hutang (Rp) <span className="text-red-500">*</span><input required type="number" min="0.01" max="9999999999.99" step="0.01" inputMode="decimal" placeholder="0" value={amount} onChange={event => setAmount(event.target.value)} className={control} />{Number(amount) > 0 && <span className="mt-1 block text-xs font-normal text-surface-600">{formatRupiah(Number(amount))}</span>}</label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Tanggal hutang <span className="text-red-500">*</span><input required type="date" max={jakartaToday()} value={debtDate} onChange={event => setDebtDate(event.target.value)} className={control} /></label><label className="block text-sm font-medium">Jatuh tempo <span className="font-normal text-surface-500">(opsional)</span><input type="date" min={debtDate} value={dueDate} onChange={event => setDueDate(event.target.value)} className={control} /></label></div>
                <label className="block text-sm font-medium">Catatan <span className="font-normal text-surface-500">(opsional)</span><textarea maxLength={1000} placeholder="Contoh: nomor tagihan atau keterangan" value={note} onChange={event => setNote(event.target.value)} className={control} rows={2} /></label>
              </section>
              <div className="border-t border-surface-200" />
            </> : <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3"><p className="text-xs text-surface-500">Hutang pemasok</p><p className="mt-1 break-words text-sm font-semibold">{selected?.supplierName}</p><p className="mt-1 text-sm text-surface-700">Sisa {formatRupiah(Math.max(0, (selected?.amount ?? 0) - (selected?.paid ?? 0)))}</p></div>}
            <section aria-labelledby="payable-payment-title" className="space-y-3">
              <div><h3 id="payable-payment-title" className="text-sm font-semibold text-surface-900">{mode === "create" ? "Pembayaran awal" : "Pembayaran"}</h3><p className="mt-1 text-xs text-surface-500">{mode === "create" ? "Opsional. Isi jika sebagian hutang sudah dibayar." : "Masukkan nominal dan tanggal pembayaran."}</p></div>
              <label className="block text-sm font-medium">{mode === "create" ? "Nominal pembayaran awal" : "Nominal pembayaran"} (Rp)<input autoFocus={mode === "payment"} required={mode === "payment"} type="number" min="0.01" step="0.01" max={mode === "payment" && selected ? Math.max(0, (Math.round(selected.amount * 100) - Math.round(selected.paid * 100)) / 100) : amount || undefined} inputMode="decimal" placeholder="0" value={payment} onChange={event => setPayment(event.target.value)} className={control} />{Number(payment) > 0 && <span className="mt-1 block text-xs font-normal text-surface-600">{formatRupiah(Number(payment))}</span>}</label>
              {(payment || mode === "payment") && <label className="block text-sm font-medium">Tanggal pembayaran<input required type="date" min={mode === "create" ? debtDate : selected?.debtDate} max={jakartaToday()} value={paidAt} onChange={event => setPaidAt(event.target.value)} className={control} /></label>}
              {mode === "create" && Number(amount) > 0 && Number(payment) > 0 && (Number(payment) > Number(amount)
                ? <p className="text-xs text-red-700">Pembayaran awal tidak boleh melebihi nominal hutang.</p>
                : <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3"><span className="text-sm font-medium text-brand-800">Sisa setelah pembayaran awal</span><strong className="text-sm tabular-nums text-brand-900">{formatRupiah((Math.round(Number(amount) * 100) - Math.round(Number(payment) * 100)) / 100)}</strong></div>)}
            </section>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          </div>
          <footer className="flex shrink-0 justify-end gap-2 border-t border-surface-200 bg-white px-5 py-3"><Button type="button" variant="ghost" onClick={() => setMode(null)} disabled={busy}>Batal</Button><Button type="submit" loading={busy} disabled={busy}>{busy ? "Menyimpan..." : mode === "create" ? "Simpan hutang" : "Simpan pembayaran"}</Button></footer>
        </form>
      </PayableDialog>}
    </section>
  );
}
