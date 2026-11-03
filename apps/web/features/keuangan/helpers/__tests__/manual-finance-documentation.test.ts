import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FAQ_WORKFLOWS } from '@/features/ai-assistant/workflows/workflow-catalog';
import { CHANGELOG } from '@/features/changelog/data/changelog';

describe('panduan pencatatan keuangan manual', () => {
  it.each([['manual-income', 'income'], ['manual-transfer-purchase', 'expense']])('memuat workflow %s dengan izin yang sesuai', (slug, resource) => {
    const guide = FAQ_WORKFLOWS.find(row => row.id.endsWith(slug));
    expect(guide).toMatchObject({ route: '/keuangan', requiredCapabilities: [{ resource, action: 'create' }] });
    expect(JSON.stringify(guide?.steps)).toContain('Unduh ulang');
  });
  it('menjelaskan kategori RC, transfer, dan koreksi pada Bantuan', () => {
    const help = readFileSync('features/help-documentation/components/HelpContent.tsx', 'utf8');
    for (const text of ['Tambah Pemasukan', 'Tambah Belanja Transfer', 'ATK, Cetak, Spanduk, Print, Stempel', 'VIA TRANSFER']) expect(help.includes(text), text).toBe(true);
  });
  it('menerbitkan catatan rilis dengan tiga langkah dan highlight ringkas', () => {
    const entry = CHANGELOG.find(row => row.id === 'manual-finance-entries');
    expect(entry).toMatchObject({ date: '2026-11-03', revision: 1, href: '/keuangan' });
    expect(entry?.steps).toHaveLength(3);
    expect(entry!.highlight.title.length).toBeLessThanOrEqual(40);
    expect(entry!.highlight.summary.length).toBeLessThanOrEqual(85);
  });
});
