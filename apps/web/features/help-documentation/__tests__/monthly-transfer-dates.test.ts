import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HELP_ROLE_CONTENT } from '../components/HelpContent';
import { FAQ_WORKFLOWS } from '@/features/ai-assistant/workflows/workflow-catalog';

const expected = [
  'transfer pembelian berdasarkan tanggal pengeluaran',
  'transfer belanja terdahulu berdasarkan tanggal pembayaran',
  'giro berdasarkan bulan jatuh tempo',
];

describe('panduan tanggal pengeluaran belanja', () => {
  it.each(['OWNER', 'ADMIN'])('membedakan tanggal transfer dan giro bagi %s', role => {
    const description = HELP_ROLE_CONTENT[role]
      .find(guide => guide.id === `${role.toLowerCase()}-export-reports`)
      ?.steps.find(step => step.title === 'Unduh laporan')?.description;
    for (const phrase of expected) expect(description).toContain(phrase);
  });

  it('menjelaskan tanggal yang sama dalam alur ekspor asisten', () => {
    const description = FAQ_WORKFLOWS.find(workflow => workflow.faqNumber === 21)
      ?.steps.find(step => step.title === 'Unduh laporan')?.description;
    for (const phrase of expected) expect(description).toContain(phrase);
  });

  it.each(['reports.md', 'financial-report.md', 'faq.md'])('menjelaskan tanggal yang sama dalam %s', file => {
    const text = readFileSync(path.join(process.cwd(), 'features/ai-assistant/docs/help', file), 'utf8');
    for (const phrase of expected) expect(text).toContain(phrase);
  });
});
