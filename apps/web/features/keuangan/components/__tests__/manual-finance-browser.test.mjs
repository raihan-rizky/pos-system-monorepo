import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const repo = process.cwd();
const web = path.join(repo, 'apps/web');
const require = createRequire(path.join(web, 'package.json'));
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('vitest')] }));
const { chromium, expect } = require('@playwright/test');
const bundle = await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {RoleProvider} from './components/providers/RoleProvider';import Page from './app/(main)/keuangan/page';createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><RoleProvider role="OWNER" userId="example-user" userName="Contoh" storeId="example-store"><Page/></RoleProvider></QueryClientProvider>);`, resolveDir: web, loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  alias: { '@': web, '@pos/ui': path.join(repo, 'packages/ui/src/index.ts') }, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'unrelated-page-boundaries', setup(builder) {
    builder.onResolve({ filter: /^(next\/(navigation|link|dynamic))$|\/(SupplierPayablesPanel|DeferredCashFlowChart)$/ }, ({ path: name }) => ({ path: name, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ resolveDir: web, loader: 'tsx', contents:
      name === 'next/navigation' ? `export const useSearchParams=()=>new URLSearchParams('month=2026-11');` :
      name === 'next/link' ? `import React from 'react';export default function Link(props){return <a {...props}/>}` :
      name === 'next/dynamic' ? `export default function dynamic(){return ()=>null}` :
      name.endsWith('SupplierPayablesPanel') ? `export const SupplierPayablesPanel=()=>null;` : `export const DeferredCashFlowChart=()=>null;` }));
  } }],
});
const sources = await Promise.all(['apps/web/app/(main)/keuangan/page.tsx', 'apps/web/features/keuangan/components/ManualFinanceFormModal.tsx', 'apps/web/features/keuangan/components/ManualIncomePanel.tsx', 'packages/ui/src/Modal.tsx', 'packages/ui/src/Button.tsx'].map(file => readFile(path.join(repo, file), 'utf8')));
const theme = require('tailwindcss/loadConfig')(path.join(repo, 'packages/config/tailwind.config.ts'));
const css = await require('postcss')([require('tailwindcss')({ ...theme, content: sources.map(raw => ({ raw, extension: 'tsx' })) })]).process('@tailwind base;@tailwind utilities;', { from: undefined });
const html = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}body{font-family:system-ui,sans-serif;background:#f8fafc}</style><body><div id="root"></div></body></html>`;
const output = path.join(repo, 'output/playwright/manual-finance');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1280, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.clock.install({ time: new Date('2026-11-03T03:00:00Z') });
    page.setDefaultTimeout(7000);
    const errors = [], writes = [];
    let incomes = [], expenses = [], failIncome = true;
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.route('http://finance.local/**', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      if (!url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'text/html', body: html });
      let data = {};
      if (method !== 'GET') {
        const payload = method === 'DELETE' ? null : request.postDataJSON();
        writes.push({ method, path: url.pathname, payload });
        if (url.pathname.includes('/income') && method === 'POST' && failIncome) { failIncome = false; return route.fulfill({ status: 422, json: { message: 'Contoh gagal simpan. Coba lagi.', errors: { amount: ['Periksa nominal.'] } } }); }
        const list = url.pathname.includes('/income') ? incomes : expenses;
        if (method === 'DELETE') list.splice(list.findIndex(row => row.id === url.pathname.split('/').at(-1)), 1);
        else {
          const id = method === 'POST' ? `example-${list.length + 1}` : url.pathname.split('/').at(-1);
          const row = { ...payload, id, category: payload.category ?? 'SUPPLIES', changeAmount: 0, netAmount: payload.amount, occurredAt: `${payload.occurredAt}T00:00:00+07:00`, createdAt: '2026-11-03T03:00:00Z', transactionId: null, attachmentUrl: null, hasMissingCostSnapshot: false, source: { type: 'MANUAL_TRANSFER_PURCHASE' }, recordedBy: { id: 'example-user', name: 'Contoh' } };
          if (method === 'POST') list.push(row); else list.splice(list.findIndex(row => row.id === id), 1, row);
          data = { data: row };
        }
      } else if (url.pathname.endsWith('/cash-flow/summary')) data = { month: '2026-11', income: { total: incomes.reduce((sum, row) => sum + row.amount, 0), daily: [] }, expense: { total: expenses.reduce((sum, row) => sum + row.amount, 0), incomplete: false, daily: [] } };
      else if (url.pathname.endsWith('/income/summary')) data = { month: '2026-11', monthlyTotal: incomes.reduce((sum, row) => sum + row.amount, 0), transactionCount: 0, manualEntryCount: incomes.length, daily: [] };
      else if (url.pathname.endsWith('/expenses/summary')) { const income = incomes.reduce((sum, row) => sum + row.amount, 0), expense = expenses.reduce((sum, row) => sum + row.amount, 0); data = { month: '2026-11', monthlyTotal: expense, entryCount: expenses.length, byCategory: [], daily: [], netCashFlow: { income, expense, net: income - expense } }; }
      else if (url.pathname.endsWith('/expense-categories')) data = { data: [] };
      else { const list = url.pathname.endsWith('/income') ? incomes : expenses; data = { data: list, pagination: { page: 1, total: list.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }; }
      return route.fulfill({ json: data });
    });
    await page.goto('http://finance.local/keuangan');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole('button', { name: 'Tambah Pemasukan', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Tambah Pemasukan', exact: true });
    await dialog.getByLabel('Tanggal', { exact: true }).focus();
    for (let step = 0; step < 4; step++) {
      await page.keyboard.press('Tab');
      if (await dialog.getByLabel('Keterangan / sumber').evaluate(element => element === document.activeElement)) break;
    }
    await expect(dialog.getByLabel('Keterangan / sumber')).toBeFocused();
    await dialog.getByLabel('Keterangan / sumber').fill('Pemasukan ATK contoh');
    await dialog.getByLabel('Nominal (Rp)').fill('100000');
    await dialog.getByLabel('Kategori RC').selectOption('ATK');
    assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'form fits viewport');
    await dialog.screenshot({ path: path.join(output, `income-${width}.png`) });
    if (width === 1280) await dialog.screenshot({ path: path.join(web, 'public/images/changelog/pemasukan-manual-keuangan.png') });
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Contoh gagal simpan');
    await expect(dialog.getByLabel('Nominal (Rp)')).toHaveValue('100000');
    await dialog.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await dialog.waitFor({ state: 'detached' });
    assert.equal(writes.filter(row => row.method === 'POST' && row.path.endsWith('/income')).length, 2, 'one retry despite double submit');
    await page.getByRole('button', { name: 'Ubah pemasukan Pemasukan ATK contoh' }).click();
    dialog = page.getByRole('dialog', { name: 'Ubah Pemasukan', exact: true });
    await dialog.getByLabel('Kategori RC').selectOption('CETAK');
    await dialog.getByRole('button', { name: 'Simpan Perubahan' }).click();
    await dialog.waitFor({ state: 'detached' });
    await expect(page.getByRole('region', { name: 'Pemasukan tanpa transaksi' })).toContainText('Cetak');
    await page.getByRole('button', { name: 'Hapus pemasukan Pemasukan ATK contoh' }).click();
    await expect(page.getByText('Belum ada pemasukan manual bulan ini.')).toBeVisible();

    await page.getByRole('button', { name: 'Tambah Belanja Transfer' }).click();
    dialog = page.getByRole('dialog', { name: 'Tambah Belanja Transfer', exact: true });
    await dialog.getByLabel('Nama penerima / supplier').fill('Pemasok contoh');
    await dialog.getByLabel('Keterangan belanja').fill('Belanja kertas contoh');
    await dialog.getByLabel('Nominal (Rp)').fill('25000');
    await expect(dialog.getByText('Bukti transfer (opsional)')).toBeVisible();
    await dialog.screenshot({ path: path.join(output, `transfer-${width}.png`) });
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    const expenseRow = page.locator('li').filter({ hasText: 'Pemasok contoh' });
    await expect(expenseRow).toContainText('Belanja Transfer Manual');
    await expenseRow.getByRole('button', { name: 'Aksi', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Ubah', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Ubah Belanja Transfer', exact: true });
    await expect(dialog.getByLabel('Nama penerima / supplier')).toHaveValue('Pemasok contoh');
    await dialog.getByLabel('Nominal (Rp)').fill('30000');
    await dialog.getByRole('button', { name: 'Simpan Perubahan' }).click();
    await dialog.waitFor({ state: 'detached' });
    await expenseRow.getByRole('button', { name: 'Aksi', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Hapus', exact: true }).click();
    await expect(page.getByText('Belum ada pengeluaran bulan ini')).toBeVisible();
    const transfer = writes.find(row => row.method === 'POST' && row.path.endsWith('/expenses'));
    assert.equal(transfer.payload.manualPurchasePaymentMethod, 'TRANSFER');
    assert.equal(transfer.payload.transactionId, undefined);
    assert.equal(writes.some(row => /stock|inventory|transactions/.test(row.path)), false);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: create, retry, double-submit protection, edit/delete income and transfer; keyboard and 320/390/1280px layouts; no stock or transaction writes.');
} finally { await browser.close(); }
