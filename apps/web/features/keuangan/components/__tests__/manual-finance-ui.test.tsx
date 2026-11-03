import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManualFinanceFormModal } from '../ManualFinanceFormModal';
import { ManualIncomePanel } from '../ManualIncomePanel';
const state = vi.hoisted(() => ({ allowed: true, error: false }));
vi.mock('@pos/ui', () => ({ Modal: ({ children, title }: any) => <section aria-label={title}>{children}</section>, Button: ({ children, ...props }: any) => <button {...props}>{children}</button> }));
vi.mock('@/components/providers/RoleProvider', () => ({ useRole: () => ({ canPerform: () => state.allowed }) }));
vi.mock('@/features/ai-assistant/hooks/useAssistantModalAction', () => ({ useAssistantModalAction: () => {} }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }), useQuery: () => ({ data: { data: [{ id: 'i1', description: 'Pendapatan contoh', category: 'ATK', amount: 100000, occurredAt: '2026-11-02T00:00:00+07:00', recordedBy: { name: 'Contoh' } }], pagination: { totalPages: 2, total: 21 } }, isLoading: false, isError: state.error, refetch: vi.fn() }) }));
vi.mock('@/features/proof-upload/components/ProofImageUploader', () => ({ ProofImageUploader: ({ label }: any) => <span>{label}</span>, deleteUploadedProof: vi.fn() }));
describe('form pencatatan keuangan manual', () => {
  beforeEach(() => { state.allowed = true; state.error = false; });
  it('menyediakan empat field pemasukan dan lima pilihan RC', () => {
    const html = renderToStaticMarkup(<ManualFinanceFormModal open kind="income" onClose={() => {}} onSaved={() => {}} />);
    for (const label of ['Tanggal', 'Keterangan / sumber', 'Nominal', 'Kategori RC', 'ATK', 'Cetak', 'Spanduk', 'Print', 'Stempel']) expect(html).toContain(label);
    expect(html).not.toContain('Nama penerima');
    expect(html).not.toContain('Bukti transfer');
  });
  it('menampilkan penerima dan bukti opsional pada transfer, serta data edit', () => {
    const html = renderToStaticMarkup(<ManualFinanceFormModal open kind="transfer" initial={{ id: 'e1', description: 'Belanja kertas', applicantName: 'Pemasok contoh', amount: 25000, occurredAt: '2026-11-02T00:00:00+07:00' }} onClose={() => {}} onSaved={() => {}} />);
    for (const label of ['Nama penerima / supplier', 'Bukti transfer (opsional)', 'Pemasok contoh', 'Belanja kertas', '25000', 'Simpan Perubahan']) expect(html).toContain(label);
    expect(html).not.toContain('Kategori RC');
  });
  it('menyediakan daftar, pagination, dan aksi sesuai izin', () => {
    let html = renderToStaticMarkup(<ManualIncomePanel month="2026-11" />);
    for (const text of ['Tambah Pemasukan', 'Pendapatan contoh', 'Ubah', 'Hapus', 'Berikutnya']) expect(html).toContain(text);
    state.allowed = false;
    html = renderToStaticMarkup(<ManualIncomePanel month="2026-11" />);
    for (const text of ['Tambah Pemasukan', 'Ubah', 'Hapus']) expect(html).not.toContain(text);
  });
  it('menyediakan aksi coba lagi jika daftar gagal dimuat', () => {
    state.error = true;
    expect(renderToStaticMarkup(<ManualIncomePanel month="2026-11" />)).toContain('Coba lagi');
  });
});
