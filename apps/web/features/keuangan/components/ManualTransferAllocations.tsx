'use client';

import { useEffect, useState } from 'react';
import { MANUAL_EXPENSE_REPORT_LABELS, type ManualExpenseReportCategory } from '../helpers/manual-report-categories';

type Payment = { id: string; amount: number; paidAt: string; origin: string; allocated?: boolean };
type Payable = { id: string; supplierName: string; amount: number; paid: number; reportCategory: ManualExpenseReportCategory | null; payments?: Payment[] };
export type TransferAllocationDraft = { payableId: string; paymentId: string | null; amount: number; supplierName: string; reportCategory: ManualExpenseReportCategory | null };
const control = 'mt-1 min-h-11 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-base text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 sm:text-sm';
const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 }).format(value);
export function canCreatePaymentForPayable(payable: { amount: number; paid: number; payments?: Array<{ origin: string }> }, canRecord: boolean, canCorrect: boolean) {
  return canRecord && (Math.round(payable.paid * 100) < Math.round(payable.amount * 100)
    || (canCorrect && Boolean(payable.payments?.some(payment => payment.origin === 'AUTO'))));
}

export function ManualTransferAllocations({ date, amount, canCreatePayment, canCorrectPayment, originalPaymentIds, value, onChange }: {
  date: string; amount: number; canCreatePayment: boolean; canCorrectPayment: boolean; originalPaymentIds: string[]; value: TransferAllocationDraft[]; onChange: (value: TransferAllocationDraft[]) => void;
}) {
  const [items, setItems] = useState<Payable[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payableId, setPayableId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [allocation, setAllocation] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    fetch(`/api/finance/supplier-payables?page=${page}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<{ items: Payable[]; total: number }> })
      .then(result => { setItems(result.items); setTotal(result.total); })
      .catch(() => { if (!controller.signal.aborted) setError('Daftar hutang belum dapat dimuat.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page]);
  const selected = items.find(item => item.id === payableId);
  const canCreateSelectedPayment = Boolean(selected && canCreatePaymentForPayable(selected, canCreatePayment, canCorrectPayment));
  const totalCents = value.reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  const remaining = (Math.round((Number.isFinite(amount) ? amount : 0) * 100) - totalCents) / 100;
  function add() {
    const number = Number(allocation);
    if (!selected || !paymentId || !/^\d+(?:\.\d{1,2})?$/.test(allocation) || number <= 0 || Math.round(number * 100) > Math.round(remaining * 100)) {
      setError('Pilih hutang dan pembayaran, lalu isi nominal yang tidak melebihi sisa transfer.'); return;
    }
    const entry = selected.payments?.find(payment => payment.id === paymentId);
    if (paymentId !== 'new' && (!entry || entry.paidAt !== date || number > entry.amount || value.some(row => row.paymentId === entry.id))) {
      setError('Pilih pembayaran pada tanggal transfer yang belum dialokasikan.'); return;
    }
    if (paymentId === 'new' && !canCreateSelectedPayment) { setError('Pembayaran baru belum dapat dicatat untuk hutang ini.'); return; }
    onChange([...value, { payableId: selected.id, paymentId: paymentId === 'new' ? null : paymentId,
      amount: number, supplierName: selected.supplierName, reportCategory: selected.reportCategory }]);
    setPayableId(''); setPaymentId(''); setAllocation(''); setError('');
  }
  return <section className="space-y-3 rounded-lg border border-surface-200 p-3" aria-labelledby="transfer-allocation-title">
    <div><h3 id="transfer-allocation-title" className="text-sm font-semibold text-surface-900">Bayar hutang dengan transfer ini</h3><p className="mt-1 text-xs text-surface-600">Pilih pembayaran yang sama atau catat pembayaran baru. Setiap bagian mengikuti kategori hutangnya.</p></div>
    {value.length > 0 && <ul className="space-y-2">{value.map((row, index) => <li key={`${row.paymentId ?? 'baru'}-${index}`} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span><strong>{row.supplierName}</strong> · {row.reportCategory ? MANUAL_EXPENSE_REPORT_LABELS[row.reportCategory] : 'Belum berkategori'} · {money(row.amount)}</span><button type="button" aria-label={`Lepaskan alokasi ${row.supplierName}`} onClick={() => onChange(value.filter((_, item) => item !== index))} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">Lepaskan</button></li>)}</ul>}
    <p className="text-sm text-surface-700" aria-live="polite">Dialokasikan {money(totalCents / 100)} · Sisa transfer {money(remaining)}</p>
    {loading ? <p className="text-xs text-surface-600" role="status">Memuat hutang...</p> : <>
      <label className="block text-sm font-medium">Hutang pemasok<select className={control} value={payableId} onChange={event => { setPayableId(event.target.value); setPaymentId(''); }}><option value="">Pilih hutang</option>{items.map(item => <option key={item.id} value={item.id}>{item.supplierName} · {item.reportCategory ? MANUAL_EXPENSE_REPORT_LABELS[item.reportCategory] : 'Belum berkategori'}</option>)}</select></label>
      {total > 20 && <div className="flex items-center gap-2 text-xs"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Sebelumnya</button><span>Halaman {page}</span><button type="button" disabled={page * 20 >= total} onClick={() => setPage(page + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Berikutnya</button></div>}
      {selected && <><label className="block text-sm font-medium">Pembayaran hutang<select className={control} value={paymentId} onChange={event => setPaymentId(event.target.value)}><option value="">Pilih pembayaran</option>{canCreateSelectedPayment && <option value="new">Catat pembayaran baru</option>}{selected.payments?.filter(payment => payment.paidAt === date && (!payment.allocated || originalPaymentIds.includes(payment.id)) && !value.some(row => row.paymentId === payment.id)).map(payment => <option key={payment.id} value={payment.id}>{payment.paidAt} · {money(payment.amount)}{payment.origin === 'AUTO' ? ' · Otomatis' : ''}</option>)}</select></label>
        <label className="block text-sm font-medium">Nominal alokasi (Rp)<input className={control} type="number" min="0.01" step="0.01" value={allocation} onChange={event => setAllocation(event.target.value)} /></label>
        <button type="button" onClick={add} className="min-h-11 rounded-lg border border-surface-300 px-3 py-2 text-sm font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">Tambah alokasi</button></>}
    </>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
