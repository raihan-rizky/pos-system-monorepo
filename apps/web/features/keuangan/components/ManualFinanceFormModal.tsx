'use client';

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Modal } from '@pos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ProofImageUploader } from '@/features/proof-upload/components/ProofImageUploader';
import { formatRupiahPrecise } from '@/lib/utils';
import { MANUAL_INCOME_CATEGORIES, MANUAL_INCOME_LABELS, MANUAL_INCOME_PAYMENT_LABELS, MANUAL_INCOME_PAYMENT_METHODS, manualFinanceDateBounds, validateManualIncome, validateManualTransfer, type ManualIncomeCategory, type ManualIncomePayment, type ManualIncomePaymentMethod } from '../helpers/manual-finance';
import { MANUAL_EXPENSE_REPORT_CATEGORIES, MANUAL_EXPENSE_REPORT_LABELS, type ManualExpenseReportCategory } from '../helpers/manual-report-categories';
import { useRole } from '@/components/providers/RoleProvider';
import { ManualTransferAllocations, type TransferAllocationDraft } from './ManualTransferAllocations';

export type ManualFinanceInitial = {
  id?: string; occurredAt: string; description: string | null; amount: number; updatedAt?: string;
  category?: ManualIncomeCategory; reportCategory?: ManualExpenseReportCategory | null; applicantName?: string; attachmentUrl?: string | null; payments?: ManualIncomePayment[];
};
type PendingTransfer = { key: string; body: string | null; createdAt: string; completedAt: string | null };
function pendingTransferLabel(attempt: PendingTransfer) {
  try {
    const body = JSON.parse(attempt.body ?? '') as { applicantName?: string; amount?: number; occurredAt?: string };
    return `${body.applicantName || 'Penerima'} · ${formatRupiahPrecise(Number(body.amount) || 0)} · ${body.occurredAt || 'Tanggal belum tersedia'}`;
  } catch { return 'Rincian transfer belum tersedia'; }
}
const inputClass = 'w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-surface-50';

function Field({ name, label, error, children }: { name: string; label: string; error?: string[]; children: ReactNode }) {
  return <div className="space-y-1"><label htmlFor={`manual-${name}`} className="block text-sm font-medium text-surface-700">{label}</label>{children}{error && <p id={`manual-${name}-error`} className="text-sm text-red-600">{error[0]}</p>}</div>;
}

type ManualFinanceFormProps = {
  open: boolean; kind: 'income' | 'transfer'; initial?: ManualFinanceInitial;
  onClose: () => void; onSaved: () => void;
};

export function ManualFinanceFormModal(props: ManualFinanceFormProps) {
  const { onClose } = props;
  const { canPerform, canAccess } = useRole();
  const permissions = JSON.stringify(props.kind === 'transfer' ? [
    canAccess?.('/keuangan'), canPerform('expense', 'read'), canPerform('expense.manual_transfer', 'create'),
    canPerform('expense.manual_transfer', 'update'), canPerform('expense.manual_transfer.edit', 'update'),
    canPerform('expense.manual_transfer.allocation', 'update'), canPerform('expense.payable', 'read'),
    canPerform('expense.payable', 'update'), canPerform('expense.payable.manual.payment', 'update'),
    canPerform('proof_upload', 'delete'),
  ] : []);
  const initialPermissions = useRef(permissions);
  const permissionsChanged = permissions !== initialPermissions.current;
  useEffect(() => { if (permissionsChanged) onClose(); }, [permissionsChanged, onClose]);
  return permissionsChanged ? null : <ManualFinanceFormState {...props} />;
}

function ManualFinanceFormState({ open, kind, initial, onClose, onSaved }: ManualFinanceFormProps) {
  const queryClient = useQueryClient();
  const { canPerform, userId, storeId } = useRole();
  const requestScope = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    const controller = new AbortController();
    requestScope.current = controller;
    return () => controller.abort();
  }, []);
  const bounds = manualFinanceDateBounds();
  const [date, setDate] = useState(() => initial?.occurredAt ? manualFinanceDateBounds(new Date(initial.occurredAt)).max : bounds.max);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
  const [category, setCategory] = useState<ManualIncomeCategory>(initial?.category ?? 'ATK');
  const [reportCategory, setReportCategory] = useState<ManualExpenseReportCategory | ''>(initial?.reportCategory ?? '');
  const [selectedMethods, setSelectedMethods] = useState<ManualIncomePaymentMethod[]>(() => initial?.payments?.map(payment => payment.method) ?? []);
  const [paymentAmounts, setPaymentAmounts] = useState<Partial<Record<ManualIncomePaymentMethod, string>>>(() => Object.fromEntries(initial?.payments?.map(payment => [payment.method, String(payment.amount)]) ?? []));
  const [applicantName, setApplicantName] = useState(initial?.applicantName ?? '');
  const [attachmentUrl, setAttachmentUrl] = useState(initial?.attachmentUrl ?? '');
  const [recordVersion, setRecordVersion] = useState(initial?.updatedAt);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [allocations, setAllocations] = useState<TransferAllocationDraft[]>([]);
  const [originalPaymentIds, setOriginalPaymentIds] = useState<string[]>([]);
  const [allocationsReady, setAllocationsReady] = useState(!initial?.id || kind === 'income');
  const [allocationLoadError, setAllocationLoadError] = useState('');
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);
  const [showPending, setShowPending] = useState(false);
  const [continueAfterAcknowledgement, setContinueAfterAcknowledgement] = useState(false);
  const saving = useRef(false);
  const currentAttempt = useRef<PendingTransfer | null>(null);
  const startNewConfirmed = useRef(false);
  const proofDeleteAttempt = useRef<{ url: string; requestKey: string; expectedUpdatedAt?: string } | null>(null);
  const income = kind === 'income';
  const attemptsEndpoint = '/api/finance/expenses/manual-transfer-attempts';
  const canAllocate = !income && canPerform('expense', 'read') && canPerform('expense.payable', 'read') && canPerform('expense.manual_transfer.allocation', 'update');
  const canCreatePayment = canPerform('expense.payable', 'update');
  const canCorrectPayment = canPerform('expense.payable.manual.payment', 'update');
  const title = income ? (initial?.id ? 'Ubah Pemasukan' : 'Tambah Pemasukan') : (initial?.id ? 'Ubah Belanja Transfer' : 'Tambah Belanja Transfer');
  const a11y = (name: string) => ({ id: `manual-${name}`, 'aria-invalid': !!errors[name], 'aria-describedby': errors[name] ? `manual-${name}-error` : undefined });
  const selectedPayments = selectedMethods.map(method => ({ method, amount: Number(selectedMethods.length === 1 ? amount : paymentAmounts[method] || 0) }));
  const difference = Math.round(Number(amount || 0) * 100) - selectedPayments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
  const completeSplit = Number(amount) > 0 && selectedPayments.every(payment => Number.isFinite(payment.amount) && payment.amount > 0 && Number(payment.amount.toFixed(2)) === payment.amount);
  useEffect(() => {
    if (income || !initial?.id || !canAllocate) { setAllocationsReady(true); return; }
    const controller = new AbortController();
    setAllocationsReady(false); setAllocationLoadError('');
    fetch(`/api/finance/expenses/${encodeURIComponent(initial.id)}/allocations`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<{ allocations: TransferAllocationDraft[] }> })
      .then(result => { setAllocations(result.allocations); setOriginalPaymentIds(result.allocations.flatMap(row => row.paymentId ? [row.paymentId] : [])); setAllocationsReady(true); })
      .catch(() => { if (!controller.signal.aborted) setAllocationLoadError('Alokasi transfer belum dapat dimuat. Tutup formulir dan coba lagi.'); });
    return () => controller.abort();
  }, [canAllocate, income, initial?.id]);
  useEffect(() => {
    if (income || initial?.id || !userId || !storeId) return;
    const controller = new AbortController();
    setAllocationsReady(false);
    fetch(attemptsEndpoint, { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      return response.json() as Promise<{ attempts: PendingTransfer[] }>;
    }).then(result => { setPendingTransfers(result.attempts); setShowPending(result.attempts.length > 0); setAllocationsReady(true); })
      .catch(() => { if (!controller.signal.aborted) setError('Percobaan transfer belum dapat dimuat. Tutup formulir dan coba lagi.'); });
    return () => controller.abort();
  }, [income, initial?.id, userId, storeId]);

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

  async function submit(event?: FormEvent, retry?: PendingTransfer) {
    event?.preventDefault();
    const signal = requestScope.current?.signal;
    if (!signal || signal.aborted || saving.current || (!retry && !allocationsReady)) return;
    setError('');
    let requestBody = retry?.body;
    if (!retry) {
      const keepLegacyUnknown = income && !!initial?.id && !initial.payments?.length && selectedPayments.length === 0;
      const payload = { occurredAt: date, description, amount: Number(amount), ...(income ? { category, ...(!keepLegacyUnknown ? { payments: selectedPayments } : {}) } : { applicantName, reportCategory, attachmentUrl: attachmentUrl || null }) };
      const validation = income ? validateManualIncome(payload) : validateManualTransfer(payload);
      if (!validation.success) { setErrors(validation.errors); return; }
      setErrors({});
      requestBody = JSON.stringify({ ...validation.data, ...(initial?.id && recordVersion ? { updatedAt: recordVersion } : {}), ...(!income ? { manualPurchasePaymentMethod: 'TRANSFER', ...(canAllocate ? { allocations: allocations.map(({ payableId, paymentId, amount: allocated }) => ({ payableId, paymentId, amount: allocated })) } : {}) } : {}) });
    }
    saving.current = true;
    setSubmitting(true);
    try {
      const endpoint = income ? '/api/finance/income' : '/api/finance/expenses';
      let attemptKey: string | undefined;
      if (!income && !initial?.id) {
        if (!userId || !storeId || !requestBody) throw new Error('Identitas pengguna atau toko belum tersedia. Muat ulang dan coba lagi.');
        if (!retry && currentAttempt.current && currentAttempt.current.body !== requestBody) {
          const latest = await fetch(attemptsEndpoint, { cache: 'no-store', signal });
          if (signal.aborted) return;
          if (!latest.ok) throw new Error('Percobaan transfer belum dapat dimuat. Coba lagi.');
          setPendingTransfers((await latest.json() as { attempts: PendingTransfer[] }).attempts);
          setShowPending(true); setError('Periksa transfer sebelumnya sebelum mencatat data yang berbeda.'); return;
        }
        const attempt = retry ?? currentAttempt.current ?? { key: crypto.randomUUID(), body: requestBody, createdAt: new Date().toISOString(), completedAt: null };
        attemptKey = attempt.key;
        currentAttempt.current = attempt;
        if (!retry) {
          const registration = await fetch(attemptsEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
            body: JSON.stringify({ key: attempt.key, body: requestBody, forceNew: startNewConfirmed.current,
              acknowledgedAttempts: pendingTransfers.map(row => ({ key: row.key, completedAt: row.completedAt })) }) });
          const registered = await registration.json().catch(() => null) as { message?: string; attempts?: PendingTransfer[] } | null;
          if (signal.aborted) return;
          if (registration.status === 409 && registered?.attempts) { setPendingTransfers(registered.attempts); setContinueAfterAcknowledgement(true); setShowPending(true); setError(registered.message || 'Periksa transfer sebelumnya.'); return; }
          if (!registration.ok) throw new Error(registered?.message || 'Percobaan transfer belum dapat disimpan.');
        }
        startNewConfirmed.current = false;
      }
      const response = await fetch(initial?.id ? `${endpoint}/${initial.id}` : endpoint, {
        method: initial?.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', ...(attemptKey ? { 'Idempotency-Key': attemptKey } : {}) },
        body: requestBody!, signal,
      });
      const body = await response.json().catch(() => null) as { message?: string; errors?: Record<string, string[]> } | null;
      if (signal.aborted) return;
      if (!response.ok) {
        setErrors(body?.errors ?? {});
        throw new Error(body?.message || 'Data belum dapat disimpan. Silakan coba lagi.');
      }
      if (attemptKey) {
        try { await fetch(attemptsEndpoint, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: attemptKey, expectedCompleted: true }), signal }); } catch { /* A confirmed transfer may be reviewed again later. */ }
      }
      if (signal.aborted) return;
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
      onSaved();
      onClose();
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Data belum dapat disimpan. Silakan coba lagi.');
    } finally { saving.current = false; if (!signal.aborted) setSubmitting(false); }
  }

  async function finishAttempt(attempt: PendingTransfer) {
    const signal = requestScope.current?.signal;
    if (!signal || signal.aborted) return;
    if (!attempt.completedAt && !window.confirm('Lupakan percobaan ini? Pastikan transfernya sudah diperiksa; tindakan ini tidak menghapus transaksi.')) return;
    setSubmitting(true); setError('');
    try {
      const response = await fetch(attemptsEndpoint, { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: attempt.key, expectedCompleted: Boolean(attempt.completedAt) }), signal });
      const result = await response.json().catch(() => null) as { message?: string; attempt?: PendingTransfer } | null;
      if (signal.aborted) return;
      if (response.status === 409 && result?.attempt) {
        setPendingTransfers(rows => rows.map(row => row.key === attempt.key ? result.attempt! : row));
        setError(result.message || 'Status transfer berubah. Periksa kembali sebelum melanjutkan.');
        return;
      }
      if (!response.ok) throw new Error();
      const remaining = pendingTransfers.filter(row => row.key !== attempt.key);
      setPendingTransfers(remaining);
      if (!remaining.length) {
        currentAttempt.current = null; setShowPending(false);
        if (continueAfterAcknowledgement) { startNewConfirmed.current = true; setContinueAfterAcknowledgement(false); }
        else { onSaved(); onClose(); }
      }
    } catch { if (!signal.aborted) setError('Percobaan transfer belum dapat diperbarui. Coba lagi.'); }
    finally { if (!signal.aborted) setSubmitting(false); }
  }

  return <Modal open={open} onClose={() => { if (!saving.current) onClose(); }} title={title} size="lg">
    {showPending ? <section className="space-y-4" aria-labelledby="pending-transfer-title">
      <div><h3 id="pending-transfer-title" className="text-sm font-semibold">Transfer sebelumnya belum dipastikan</h3><p className="mt-1 text-sm text-surface-600">Periksa status setiap transfer. Coba lagi jika belum tersimpan, atau pilih Selesai untuk transfer yang sudah tercatat.</p></div>
      <ul className="space-y-3">{pendingTransfers.map((attempt, index) => <li key={attempt.key} className="space-y-2 rounded-lg border border-surface-200 p-3 text-sm">
        <p>{pendingTransferLabel(attempt)}</p>
        <p className="font-semibold">{attempt.completedAt ? 'Transfer sudah tersimpan.' : 'Hasil penyimpanan belum dipastikan. Coba lagi untuk memeriksanya.'}</p>
        <p className="text-xs text-surface-500">Percobaan {new Date(attempt.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</p>
        {!attempt.body && <p className="text-xs text-surface-600">Izin melihat alokasi hutang diperlukan untuk memeriksa rincian ini.</p>}
        <div className="flex flex-wrap gap-2">{!attempt.completedAt && <button type="button" disabled={submitting || !attempt.body} onClick={() => { void submit(undefined, attempt); }} aria-label={`Coba lagi transfer sebelumnya ${index + 1}`} className="min-h-11 rounded-lg border border-surface-300 px-3 font-semibold text-brand-700">Coba lagi transfer sebelumnya</button>}
          <button type="button" disabled={submitting} onClick={() => { void finishAttempt(attempt); }} className="min-h-11 px-2 text-surface-700 underline">{attempt.completedAt ? 'Selesai' : 'Lupakan'}</button></div>
      </li>)}</ul>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={submitting} onClick={onClose}>Batal</Button><Button type="button" disabled={submitting} onClick={() => { currentAttempt.current = null; if (pendingTransfers.some(attempt => attempt.completedAt)) { setContinueAfterAcknowledgement(true); setError('Transfer sebelumnya sudah tersimpan. Pilih Selesai sebelum mencatat transfer baru.'); } else { startNewConfirmed.current = true; setShowPending(false); setError(''); } }}>Catat transfer baru</Button></div>
    </section> : <form className="space-y-4" onSubmit={event => { void submit(event); }}>
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
        {!income && <Field name="reportCategory" label="Kategori laporan" error={errors.reportCategory}>
          <select {...a11y('reportCategory')} className={inputClass} required value={reportCategory} onChange={event => setReportCategory(event.target.value as ManualExpenseReportCategory | '')}>
            <option value="" disabled>Pilih kategori laporan</option>
            {MANUAL_EXPENSE_REPORT_CATEGORIES.map(value => <option key={value} value={value}>{MANUAL_EXPENSE_REPORT_LABELS[value]}</option>)}
          </select>
        </Field>}
        {canAllocate && allocationsReady && <ManualTransferAllocations date={date} amount={Number(amount)} canCreatePayment={canCreatePayment} canCorrectPayment={canCorrectPayment} originalPaymentIds={originalPaymentIds} value={allocations} onChange={setAllocations} />}
        {allocationLoadError && <p role="alert" className="text-sm text-red-700">{allocationLoadError}</p>}
        {canAllocate && !allocationsReady && !allocationLoadError && <p role="status" className="text-sm text-surface-600">Memuat alokasi transfer...</p>}
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
        {!income && <ProofImageUploader context={initial?.id ? "manual-transfer-edit" : "manual-transfer"} label="Bukti transfer (opsional)" value={attachmentUrl} onChange={setAttachmentUrl} disabled={submitting} retainStoredFile detachOnly={!initial?.id || initial.attachmentUrl !== attachmentUrl} onDelete={async url => {
          if (!initial?.id || initial.attachmentUrl !== url) return;
          if (!proofDeleteAttempt.current || proofDeleteAttempt.current.url !== url) proofDeleteAttempt.current = { url, requestKey: crypto.randomUUID(), expectedUpdatedAt: recordVersion };
          const signal = requestScope.current?.signal;
          if (!signal || signal.aborted) throw new Error('Sesi berubah. Muat ulang dan coba lagi.');
          const response = await fetch(`/api/finance/expenses/${initial.id}/attachment`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proofDeleteAttempt.current), signal });
          const result = await response.json().catch(() => null) as { data?: { updatedAt?: string }; message?: string } | null;
          if (signal.aborted) return;
          if (!response.ok || !result?.data?.updatedAt) throw new Error(result?.message || 'Bukti transfer belum dapat dihapus.');
          setRecordVersion(result.data.updatedAt);
          proofDeleteAttempt.current = null;
          void queryClient.invalidateQueries({ queryKey: ['finance'] });
        }} />}
      </fieldset>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={submitting} onClick={onClose}>Batal</Button><Button type="submit" disabled={submitting || !allocationsReady}>{submitting ? 'Menyimpan...' : initial?.id ? 'Simpan Perubahan' : 'Simpan'}</Button></div>
    </form>}
  </Modal>;
}
