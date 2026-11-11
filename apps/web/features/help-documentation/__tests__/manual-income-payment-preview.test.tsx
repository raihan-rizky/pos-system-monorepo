import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { FinancePreview } from '../components/app-shell-preview/pages/FinancePreview';

it('menunjukkan contoh pemecahan metode pada panduan pemasukan, bukan form belanja transfer', () => {
  const context = { page: 'finance' as const, state: '', stepNumber: 1, stepTitle: 'Tambah Pemasukan', callout: '' };
  const income = renderToStaticMarkup(FinancePreview({ ...context, activeTarget: 'finance-manual-income-form' }));
  const transfer = renderToStaticMarkup(FinancePreview({ ...context, activeTarget: 'finance-manual-transfer-form' }));
  expect(income).toContain('Metode pembayaran');
  expect(income).toContain('Tunai');
  expect(income).toContain('Transfer');
  expect(transfer).not.toContain('Metode pembayaran');
});
