'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Modal } from '@pos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ProofImageUploader, deleteUploadedProof } from '@/features/proof-upload/components/ProofImageUploader';
import { formatRupiahPrecise } from '@/lib/utils';
import { MANUAL_INCOME_CATEGORIES, MANUAL_INCOME_LABELS, MANUAL_INCOME_PAYMENT_LABELS, MANUAL_INCOME_PAYMENT_METHODS, manualFinanceDateBounds, validateManualIncome, validateManualTransfer, type ManualIncomeCategory, type ManualIncomePayment, type ManualIncomePaymentMethod } from '../helpers/manual-finance';

export type ManualFinanceInitial = {
  id?: string; occurredAt: string; description: string | null; amount: number; updatedAt?: string;
  category?: ManualIncomeCategory; applicantName?: string; attachmentUrl?: string | null; payments?: ManualIncomePayment[];
};
const inputClass = 'w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-surface-50';

function Field({ name, label, error, children }: { name: string; label: string; error?: string[]; children: ReactNode }) {
  return <div className="space-y-1"><label htmlFor={`manual-${name}`} className="block text-sm font-medium text-surface-700">{label}</label>{children}{error && <p id={`manual-${name}-error`} className="text-sm text-red-600">{error[0]}</p>}</div>;
}

export function ManualFinanceFormModal({ open, kind, initial, onClose, onSaved }: {
  open: boolean; kind: 'income' | 'transfer'; initial?: ManualFinanceInitial;
  onClose: () => void; onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const bounds = manualFinanceDateBounds();
  const [date, setDate] = useState(() => initial?.occurredAt ? manualFinanceDateBounds(new Date(initial.occurredAt)).max : bounds.max);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
  const [category, setCategory] = useState<ManualIncomeCategory>(initial?.category ?? 'ATK');
  const [selectedMethods, setSelectedMethods] = useState<ManualIncomePaymentMethod[]>(() => initial?.payments?.map(payment => payment.method) ?? []);
  const [paymentAmounts, setPaymentAmounts] = useState<Partial<Record<ManualIncomePaymentMethod, string>>>(() => Object.fromEntries(initial?.payments?.map(payment => [payment.method, String(payment.amount)]) ?? []));
  const [applicantName, setApplicantName] = useState(initial?.applicantName ?? '');
  const [attachmentUrl, setAttachmentUrl] = useState(initial?.attachmentUrl ?? '');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const saving = useRef(false);
  const income = kind === 'income';
  const title = income ? (initial?.id ? 'Ubah Pemasukan' : 'Tambah Pemasukan') : (initial?.id ? 'Ubah Belanja Transfer' : 'Tambah Belanja Transfer');
  const a11y = (name: string) => ({ id: `manual-${name}`, 'aria-invalid': !!errors[name], 'aria-describedby': errors[name] ? `manual-${name}-error` : undefined });
  const selectedPayments = selectedMethods.map(method => ({ method, amount: Number(selectedMethods.length === 1 ? amount : paymentAmounts[method] || 0) }));
  const difference = Math.round(Number(amount || 0) * 100) - selectedPayments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
  const completeSplit = Number(amount) > 0 && selectedPayments.every(payment => Number.isFinite(payment.amount) && payment.amount > 0 && Number(payment.amount.toFixed(2)) === payment.amount);

  function clearPaymentError() {
    setErrors(current => {
      if (!current.payments) return current;
      const next = { ...current };
      delete next.payments;
      return next;
    });
  }

  function togglePaymentMethod(method: ManualIncomePaymentMethod) {
    clearPaymentError();
    if (selectedMethods.includes(method)) {
      setSelectedMethods(current => current.filter(item => item !== method));
    } else {
      if (selectedMethods.length === 1) {
        const first = selectedMethods[0];
        setPaymentAmounts(current => ({ ...current, [first]: amount, [method]: current[method] ?? '' }));
      }
      setSelectedMethods(current => [...current, method]);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    const keepLegacyUnknown = income && !!initial?.id && !initial.payments?.length && selectedPayments.length === 0;
    const payload = { occurredAt: date, description, amount: Number(amount), ...(income ? { category, ...(!keepLegacyUnknown ? { payments: selectedPayments } : {}) } : { applicantName, attachmentUrl: attachmentUrl || null }) };
    const validation = income ? validateManualIncome(payload) : validateManualTransfer(payload);
    setError('');
    if (!validation.success) { setErrors(validation.errors); return; }
    setErrors({});
    saving.current = true;
    setSubmitting(true);
    try {
      const endpoint = income ? '/api/finance/income' : '/api/finance/expenses';
      const response = await fetch(initial?.id ? `${endpoint}/${initial.id}` : endpoint, {
        method: initial?.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validation.data, ...(income && initial?.id && initial.updatedAt ? { updatedAt: initial.updatedAt } : {}), ...(!income ? { manualPurchasePaymentMethod: 'TRANSFER' } : {}) }),
      });
      const body = await response.json().catch(() => null) as { message?: string; errors?: Record<string, string[]> } | null;
      if (!response.ok) {
        setErrors(body?.errors ?? {});
        throw new Error(body?.message || 'Data belum dapat disimpan. Silakan coba lagi.');
      }
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Data belum dapat disimpan. Silakan coba lagi.');
    } finally { saving.current = false; setSubmitting(false); }
  }

  return <Modal open={open} onClose={() => { if (!saving.current) onClose(); }} title={title} size="lg">
    <form className="space-y-4" onSubmit={event => { void submit(event); }}>
      <p className="text-sm text-surface-500">{income ? 'Catat pemasukan tanpa transaksi. Nominal akan masuk ke kategori RC yang dipilih.' : 'Catat belanja yang dibayar melalui transfer. Catatan ini tidak menambah stok barang.'}</p>
      <fieldset disabled={submitting} className="space-y-4">
        <Field name="occurredAt" label={income ? 'Tanggal' : 'Tanggal transfer'} error={errors.occurredAt}>
          <input {...a11y('occurredAt')} className={inputClass} type="date" min={bounds.min} max={bounds.max} required value={date} onChange={event => setDate(event.target.value)} />
        </Field>
        {!income && <Field name="applicantName" label="Nama penerima / supplier" error={errors.applicantName}>
          <input {...a11y('applicantName')} className={inputClass} required maxLength={100} value={applicantName} onChange={event => setApplicantName(event.target.value)} autoComplete="off" />
        </Field>}
        <Field name="description" label={income ? 'Keterangan / sumber' : 'Keterangan belanja'} error={errors.description}>
          <textarea {...a11y('description')} className={inputClass} required maxLength={500} rows={3} value={description} onChange={event => setDescription(event.target.value)} />
        </Field>
        <Field name="amount" label="Nominal (Rp)" error={errors.amount}>
          <input {...a11y('amount')} className={inputClass} type="number" inputMode="decimal" min="0.01" max="9999999999.99" step="0.01" required value={amount} onChange={event => { setAmount(event.target.value); clearPaymentError(); }} />
        </Field>
        {income && <Field name="category" label="Kategori RC" error={errors.category}>
          <select {...a11y('category')} className={inputClass} value={category} onChange={event => setCategory(event.target.value as ManualIncomeCategory)}>
            {MANUAL_INCOME_CATEGORIES.map(value => <option key={value} value={value}>{MANUAL_INCOME_LABELS[value]}</option>)}
          </select>
        </Field>}
        {income && <fieldset className="space-y-2" aria-describedby={errors.payments ? 'manual-payments-error' : undefined}>
          <legend className="text-sm font-medium text-surface-700">Metode pembayaran</legend>
          <p className="text-xs text-surface-500">Pilih satu atau beberapa metode penerimaan.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MANUAL_INCOME_PAYMENT_METHODS.map(method => <button key={method} type="button" aria-pressed={selectedMethods.includes(method)} onClick={() => togglePaymentMethod(method)} className={`rounded-lg border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-300 ${selectedMethods.includes(method) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-300 bg-white text-surface-700'}`}>{MANUAL_INCOME_PAYMENT_LABELS[method]}</button>)}
          </div>
          {selectedMethods.map(method => <Field key={method} name={`payment-${method}`} label={`Jumlah ${MANUAL_INCOME_PAYMENT_LABELS[method]} (Rp)`}>
            <input id={`manual-payment-${method}`} className={inputClass} type="number" inputMode="decimal" min="0.01" max="9999999999.99" step="0.01" readOnly={selectedMethods.length === 1} value={selectedMethods.length === 1 ? amount : paymentAmounts[method] ?? ''} onChange={event => { setPaymentAmounts(current => ({ ...current, [method]: event.target.value })); clearPaymentError(); }} />
          </Field>)}
          {selectedMethods.length > 1 && <p className="text-xs text-surface-600" aria-live="polite">{!completeSplit ? 'Isi nominal pemasukan dan setiap metode.' : difference === 0 ? 'Jumlah pembayaran sesuai.' : `${difference > 0 ? 'Sisa' : 'Kelebihan'} ${formatRupiahPrecise(Math.abs(difference) / 100)}`}</p>}
          {!selectedMethods.length && initial?.id && !initial.payments?.length && <p className="text-xs text-surface-500">Metode pembayaran sebelumnya belum dicatat.</p>}
          {errors.payments && <p id="manual-payments-error" role="alert" className="text-sm text-red-600">{errors.payments[0]}</p>}
        </fieldset>}
        {!income && <ProofImageUploader context={initial?.id ? "manual-transfer-edit" : "manual-transfer"} label="Bukti transfer (opsional)" value={attachmentUrl} onChange={setAttachmentUrl} disabled={submitting} onDelete={async url => {
          if (!initial?.id || initial.attachmentUrl !== url) return deleteUploadedProof(url);
          const response = await fetch(`/api/finance/expenses/${initial.id}/attachment`, { method: 'DELETE' });
          if (!response.ok) throw new Error('Bukti transfer belum dapat dihapus.');
          void queryClient.invalidateQueries({ queryKey: ['finance'] });
        }} />}
      </fieldset>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={submitting} onClick={onClose}>Batal</Button><Button type="submit" disabled={submitting}>{submitting ? 'Menyimpan...' : initial?.id ? 'Simpan Perubahan' : 'Simpan'}</Button></div>
    </form>
  </Modal>;
}
