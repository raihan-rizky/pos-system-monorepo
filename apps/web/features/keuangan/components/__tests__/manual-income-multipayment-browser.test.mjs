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
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {RoleProvider} from './components/providers/RoleProvider';import {ManualIncomePanel} from './features/keuangan/components/ManualIncomePanel';createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><RoleProvider role="OWNER" userId="example-user" userName="Contoh" storeId="example-store"><ManualIncomePanel month="2026-11"/></RoleProvider></QueryClientProvider>);`, resolveDir: web, loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  alias: { '@': web, '@pos/ui': path.join(repo, 'packages/ui/src/index.ts') }, define: { 'process.env.NODE_ENV': '"production"' },
});
const sourceFiles = ['apps/web/features/keuangan/components/ManualFinanceFormModal.tsx', 'apps/web/features/keuangan/components/ManualIncomePanel.tsx', 'packages/ui/src/Modal.tsx', 'packages/ui/src/Button.tsx'];
const sources = await Promise.all(sourceFiles.map(file => readFile(path.join(repo, file), 'utf8')));
const theme = require('tailwindcss/loadConfig')(path.join(repo, 'packages/config/tailwind.config.ts'));
const css = await require('postcss')([require('tailwindcss')({ ...theme, content: sources.map(raw => ({ raw, extension: 'tsx' })) })]).process('@tailwind base;@tailwind utilities;', { from: undefined });
const html = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}body{font-family:system-ui,sans-serif;background:#f8fafc}</style><body><div id="root"></div></body></html>`;
const output = path.join(repo, 'output/playwright/manual-income-multipayment');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1280, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.clock.install({ time: new Date('2026-11-10T03:00:00Z') });
    page.setDefaultTimeout(5000);
    const errors = [], writes = [];
    let rows = [{ id: 'legacy', description: 'Pemasukan lama', category: 'ATK', amount: 100000, occurredAt: '2026-11-09T00:00:00+07:00', updatedAt: '2026-11-09T00:00:00.000Z', recordedBy: { id: 'example-user', name: 'Contoh' }, payments: [] }];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://finance.local/**', async route => {
      const request = route.request(), url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'text/html', body: html });
      if (request.method() === 'GET') return route.fulfill({ json: { data: rows, pagination: { page: 1, total: rows.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false } } });
      const payload = request.postDataJSON();
      writes.push({ method: request.method(), payload });
      const id = request.method() === 'POST' ? 'new-income' : url.pathname.split('/').at(-1);
      const old = rows.find(row => row.id === id);
      const row = { ...old, ...payload, id, occurredAt: `${payload.occurredAt}T00:00:00+07:00`, recordedBy: { id: 'example-user', name: 'Contoh' }, payments: payload.payments ?? old?.payments ?? [] };
      rows = [...rows.filter(item => item.id !== id), row];
      return route.fulfill({ json: { data: row } });
    });
    await page.goto('http://finance.local/keuangan');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });

    await page.getByRole('button', { name: 'Ubah pemasukan Pemasukan lama' }).click();
    let dialog = page.getByRole('dialog', { name: 'Ubah Pemasukan' });
    await dialog.getByLabel('Keterangan / sumber').fill('Pemasukan lama diperbaiki');
    await dialog.getByRole('button', { name: 'Simpan Perubahan' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(writes[0].payload.payments, undefined, 'editing old income does not invent payment methods');
    assert.equal(writes[0].payload.updatedAt, '2026-11-09T00:00:00.000Z', 'editing sends the version loaded with the record');

    await page.getByRole('button', { name: 'Tambah Pemasukan' }).click();
    dialog = page.getByRole('dialog', { name: 'Tambah Pemasukan' });
    await dialog.getByRole('button', { name: 'Tunai', exact: true }).click();
    await dialog.getByRole('button', { name: 'Transfer', exact: true }).click();
    await expect(dialog.getByText('Jumlah pembayaran sesuai.')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Transfer', exact: true }).click();
    await dialog.getByRole('button', { name: 'Tunai', exact: true }).click();
    await dialog.getByLabel('Keterangan / sumber').fill('Pemasukan contoh');
    await dialog.getByLabel('Nominal (Rp)').fill('100000');
    const cash = dialog.getByRole('button', { name: 'Tunai', exact: true });
    await cash.focus();
    await page.keyboard.press('Space');
    await expect(cash).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByLabel('Jumlah Tunai (Rp)')).toHaveValue('100000');
    await dialog.getByLabel('Nominal (Rp)').fill('125000');
    await expect(dialog.getByLabel('Jumlah Tunai (Rp)')).toHaveValue('125000');
    await dialog.getByLabel('Nominal (Rp)').fill('100000');
    await dialog.getByRole('button', { name: 'Transfer', exact: true }).click();
    await dialog.getByRole('button', { name: 'QRIS', exact: true }).click();
    await dialog.getByLabel('Jumlah Tunai (Rp)').fill('40000');
    await dialog.getByLabel('Jumlah Transfer (Rp)').fill('35000');
    await dialog.getByLabel('Jumlah QRIS (Rp)').fill('20000');
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(dialog.getByText(/jumlah pembayarannya sama/i)).toBeVisible();
    assert.equal(writes.length, 1, 'unbalanced split is not sent');
    await dialog.getByLabel('Jumlah QRIS (Rp)').fill('25000');
    await expect(dialog.getByText(/jumlah pembayarannya sama/i)).toHaveCount(0);
    assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'modal fits viewport');
    if (width === 1280) {
      await dialog.getByRole('group', { name: 'Metode pembayaran' }).screenshot({ path: path.join(output, 'pemasukan-metode.png') });
    }
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.deepEqual(writes.at(-1).payload.payments, [{ method: 'CASH', amount: 40000 }, { method: 'TRANSFER', amount: 35000 }, { method: 'QRIS', amount: 25000 }]);
    const entry = page.locator('li').filter({ hasText: 'Pemasukan contoh' });
    await expect(entry).toContainText('Tunai');
    await expect(entry).toContainText('Transfer');
    await expect(entry).toContainText('QRIS');
    await entry.getByRole('button', { name: 'Ubah pemasukan Pemasukan contoh' }).click();
    dialog = page.getByRole('dialog', { name: 'Ubah Pemasukan' });
    await expect(dialog.getByLabel('Jumlah Tunai (Rp)')).toHaveValue('40000');
    await expect(dialog.getByLabel('Jumlah Transfer (Rp)')).toHaveValue('35000');
    await expect(dialog.getByLabel('Jumlah QRIS (Rp)')).toHaveValue('25000');
    if (width === 1280) {
      await dialog.getByRole('button', { name: 'Tutup modal' }).click();
      await page.getByRole('button', { name: 'Tambah Pemasukan' }).click();
      dialog = page.getByRole('dialog', { name: 'Tambah Pemasukan' });
      await dialog.getByLabel('Keterangan / sumber').fill('Pemasukan pecahan');
      await dialog.getByLabel('Nominal (Rp)').fill('0.99');
      await dialog.getByRole('button', { name: 'Tunai', exact: true }).click();
      await dialog.getByRole('button', { name: 'Transfer', exact: true }).click();
      await dialog.getByLabel('Jumlah Tunai (Rp)').fill('0.50');
      await dialog.getByLabel('Jumlah Transfer (Rp)').fill('0.48');
      await expect(dialog.getByText(/Sisa\s+Rp\s*0,01/)).toBeVisible();
      await dialog.getByLabel('Jumlah Transfer (Rp)').fill('0.49');
      await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      const fractionalEntry = page.locator('li').filter({ hasText: 'Pemasukan pecahan' });
      await expect(fractionalEntry).toContainText(/Rp\s*0,99/);
      await expect(fractionalEntry).toContainText(/Rp\s*0,5/);
      await expect(fractionalEntry).toContainText(/Rp\s*0,49/);
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: legacy editing, three-method validation, save/reopen, keyboard and 320/390/1280px layouts.');
} finally { await browser.close(); }
