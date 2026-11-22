import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FAQ_WORKFLOWS } from '@/features/ai-assistant/workflows/workflow-catalog';
import { CHANGELOG } from '@/features/changelog/data/changelog';

describe('panduan pencatatan keuangan manual', () => {
  it.each([['manual-income', 'income.manual'], ['manual-transfer-purchase', 'expense.manual_transfer']])('memuat workflow %s dengan izin yang sesuai', (slug, resource) => {
    const guide = FAQ_WORKFLOWS.find(row => row.id.endsWith(slug));
    expect(guide).toMatchObject({ route: '/keuangan', requiredCapabilities: [{ resource, action: 'create' }] });
    expect(JSON.stringify(guide?.steps)).toContain('Unduh ulang');
  });
  it('menjelaskan kategori RC, transfer, dan koreksi pada Bantuan', () => {
    const help = readFileSync('features/help-documentation/components/HelpContent.tsx', 'utf8');
    for (const text of ['Tambah Pemasukan', 'Tambah Belanja Transfer', 'ATK, Cetak, Spanduk, Print, Stempel', 'VIA TRANSFER']) expect(help.includes(text), text).toBe(true);
  });
  it('menjelaskan ringkasan dan pelepasan bukti pengeluaran sesuai perilaku saat ini', () => {
    const help = readFileSync('features/help-documentation/components/HelpContent.tsx', 'utf8');
    expect(help.includes('Pembayaran hutang manual yang belum terhubung ke transfer')).toBe(true);
    expect(help.includes('File foto pengeluaran tetap tersimpan')).toBe(true);
    expect(help.includes('Foto R2 dihapus permanen')).toBe(false);
  });
  it('menjelaskan cara menyelesaikan dan memastikan pencatatan hutang', () => {
    const help = readFileSync('features/help-documentation/components/HelpContent.tsx', 'utf8');
    expect(help.includes('Pastikan hutang')).toBe(true);
    expect(help.includes('Pastikan pembayaran')).toBe(true);
    const guide = JSON.stringify(FAQ_WORKFLOWS.find(item => item.faqNumber === 44));
    expect(guide.includes('Pastikan hutang')).toBe(true);
    expect(guide.includes('Selesai')).toBe(true);
  });
  it('menerbitkan catatan rilis dengan tiga langkah dan highlight ringkas', () => {
    const entry = CHANGELOG.find(row => row.id === 'manual-finance-entries');
    expect(entry).toMatchObject({ date: '2026-11-03', revision: 1, href: '/keuangan' });
    expect(entry?.steps).toHaveLength(3);
    expect(entry!.highlight.title.length).toBeLessThanOrEqual(40);
    expect(entry!.highlight.summary.length).toBeLessThanOrEqual(85);
  });
});
