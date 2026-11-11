'use client';

import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@pos/ui';
import { useRole } from '@/components/providers/RoleProvider';
import { useAssistantModalAction } from '@/features/ai-assistant/hooks/useAssistantModalAction';
import { formatRupiahPrecise } from '@/lib/utils';
import type { PaginationMeta } from '@/lib/api/responses';
import { MANUAL_INCOME_LABELS, MANUAL_INCOME_PAYMENT_LABELS } from '../helpers/manual-finance';
import { ManualFinanceFormModal, type ManualFinanceInitial } from './ManualFinanceFormModal';

type IncomeRow = ManualFinanceInitial & { id: string; category: keyof typeof MANUAL_INCOME_LABELS; recordedBy: { name: string } };

export function ManualIncomePanel({ month }: { month: string }) {
  const { canPerform } = useRole();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ initial?: IncomeRow } | null>(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const deletingRef = useRef(false);
  const canCreate = canPerform('income.manual', 'create');
  const canRead = canPerform('income.manual', 'read');
  const query = useQuery({
    queryKey: ['finance', 'manual-income', month, page], enabled: canRead,
    queryFn: async () => {
      const response = await fetch(`/api/finance/income?${new URLSearchParams({ month, page: String(page) })}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Pemasukan manual belum dapat dimuat.');
      return response.json() as Promise<{ data: IncomeRow[]; pagination: PaginationMeta }>;
    },
  });
  const openCreate = useCallback(() => { if (canCreate) setModal({}); }, [canCreate]);
  useAssistantModalAction('income-create', openCreate);

  async function remove(row: IncomeRow) {
    if (deletingRef.current || !confirm(`Hapus pemasukan “${row.description}”?`)) return;
    deletingRef.current = true; setDeleting(row.id); setError('');
    try {
      const response = await fetch(`/api/finance/income/${row.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Pemasukan belum dapat dihapus. Silakan coba lagi.');
      if (page > 1 && query.data?.data.length === 1) setPage(page - 1);
      await queryClient.invalidateQueries({ queryKey: ['finance'] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Pemasukan belum dapat dihapus.'); }
    finally { deletingRef.current = false; setDeleting(null); }
  }

  if (!canRead && !canCreate) return null;
  return <section className="border-t border-surface-200" aria-label="Pemasukan tanpa transaksi">
    <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-4"><h3 className="text-sm font-semibold text-surface-900">Pemasukan tanpa transaksi</h3>{canCreate && <Button type="button" size="sm" onClick={openCreate}>Tambah Pemasukan</Button>}</header>
    <p className="px-3 pb-3 text-xs text-surface-500 sm:px-4">Masuk ke RC sesuai kategori. Unduh ulang Excel setelah mencatat atau mengoreksi data.</p>
    {error && <p role="alert" className="px-4 py-2 text-sm text-red-600">{error}</p>}
    {canRead && (query.isLoading ? <p role="status" className="p-4 text-sm text-surface-500">Memuat pemasukan manual...</p> : query.isError ? <div role="alert" className="p-4 text-sm text-red-600">Pemasukan manual belum dapat dimuat. <button type="button" className="underline" onClick={() => { void query.refetch(); }}>Coba lagi</button></div> : !query.data?.data.length ? <p className="p-4 text-sm text-surface-500">Belum ada pemasukan manual bulan ini.</p> : <>
      <ul className="max-h-80 divide-y divide-surface-100 overflow-y-auto">{query.data.data.map(row => <li key={row.id} className="space-y-2 px-3 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-medium text-surface-900">{row.description}</p><p className="text-xs text-surface-500">{new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(row.occurredAt))} · {MANUAL_INCOME_LABELS[row.category]}</p><p className="break-words text-xs text-surface-500">{row.payments?.length ? row.payments.map(payment => `${MANUAL_INCOME_PAYMENT_LABELS[payment.method]} ${formatRupiahPrecise(payment.amount)}`).join(' · ') : 'Metode pembayaran belum dicatat'}</p></div><span className="shrink-0 text-sm font-semibold text-emerald-700">{formatRupiahPrecise(row.amount)}</span></div>
        <div className="flex justify-end gap-3 text-xs">{canPerform('income.manual', 'update') && <button type="button" disabled={!!deleting} aria-label={`Ubah pemasukan ${row.description}`} className="min-h-9 text-brand-700" onClick={() => setModal({ initial: row })}>Ubah</button>}{canPerform('income.manual', 'delete') && <button type="button" disabled={!!deleting} aria-label={`Hapus pemasukan ${row.description}`} className="min-h-9 text-red-600 disabled:opacity-50" onClick={() => { void remove(row); }}>{deleting === row.id ? 'Menghapus...' : 'Hapus'}</button>}</div>
      </li>)}</ul>
      {(query.data.pagination.totalPages > 1) && <footer className="flex items-center justify-between gap-2 border-t border-surface-100 px-3 py-2 text-xs"><Button type="button" variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Sebelumnya</Button><span>{page} / {query.data.pagination.totalPages}</span><Button type="button" variant="ghost" size="sm" disabled={page >= query.data.pagination.totalPages} onClick={() => setPage(page + 1)}>Berikutnya</Button></footer>}
    </>)}
    {modal && <ManualFinanceFormModal key={modal.initial?.id ?? 'create'} open kind="income" initial={modal.initial} onClose={() => setModal(null)} onSaved={() => setError('')} />}
  </section>;
}
