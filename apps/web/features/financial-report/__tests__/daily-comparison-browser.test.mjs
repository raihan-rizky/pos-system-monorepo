import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repo = process.cwd(), web = path.join(repo, 'apps/web');
const require = createRequire(path.join(web, 'package.json'));
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('vitest')] }));
const { chromium, expect } = require('@playwright/test');
const bundle = await build({
  stdin: { contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {DailyIncomeReceiptDialog} from './features/financial-report/components/DailyIncomeReceiptDialog';function App(){const [open,setOpen]=useState(false);const preview=new URL(location.href).searchParams.has('preview');return <><button onClick={()=>setOpen(true)}>Buka rincian</button>{open&&<DailyIncomeReceiptDialog date="2026-11-08" previewSales={preview} allowComparison onClose={()=>setOpen(false)}/>}</>};createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><App/></QueryClientProvider>);`, resolveDir: web, loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', alias: { '@': web }, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'comparison-boundaries', setup(builder) {
    builder.onResolve({ filter: /providers\/RoleProvider$|^next\/link$/ }, ({ path: name }) => ({ path: name, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ resolveDir: web, loader: 'tsx', contents: name === 'next/link' ? `import React from 'react';export default function Link(props){return <a {...props}/>} ` : `export function useRole(){return {userId:'user-a',storeId:'store-a',authorizationFingerprint:'grant-a',canPerform:()=>true,canAccess:()=>true}}` }));
  } }],
});
const sourceFiles = ['apps/web/features/financial-report/components/DailyIncomeReceiptDialog.tsx', 'apps/web/features/financial-report/components/DailyIncomeComparison.tsx'];
const sources = await Promise.all(sourceFiles.map(file => readFile(path.join(repo, file), 'utf8').catch(() => '')));
const theme = require('tailwindcss/loadConfig')(path.join(repo, 'packages/config/tailwind.config.ts'));
const css = await require('postcss')([require('tailwindcss')({ ...theme, content: sources.map(raw => ({ raw, extension: 'tsx' })) })]).process('@tailwind base;@tailwind utilities;', { from: undefined });
const html = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}body{font-family:system-ui,sans-serif}</style><body><div id="root"></div></body></html>`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1280, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], requests = [], writes = [];
    let saved = null, cashPos = 100.25, conflict = false, failSave = false, holdSave = false, releaseSave, failReceipt = false, denyReceipt = false, holdLatest = false, releaseLatest;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://comparison.local/**', async route => {
      const req = route.request(), url = new URL(req.url());
      if (!url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'text/html', body: html });
      requests.push({ path: url.pathname, params: Object.fromEntries(url.searchParams) });
      const preview = url.searchParams.get('view') === 'sales';
      const methods = [{ method: 'CASH', amount: cashPos }, { method: 'TRANSFER', amount: 0.1 }, { method: 'Belum dicatat', amount: 0.1 }];
      if (url.pathname === '/api/history/receipts') {
        if (denyReceipt) { denyReceipt = false; return route.fulfill({ status: 403, json: { message: 'Akses rincian belum diizinkan.' } }); }
        if (failReceipt) { failReceipt = false; return route.fulfill({ status: 503, json: { message: 'Rincian contoh belum dapat dimuat.' } }); }
        return route.fulfill({ json: { items: [{ transactionId: 'old', invoiceNumber: 'INV-OLD', date: '2026-11-08', amount: cashPos, methods: ['CASH'] }], manualDetailsAvailable: false, summary: { total: cashPos + 0.2, paymentMethods: methods }, comparisonAccess: { read: true, create: !preview, update: !preview } } });
      }
      if (url.pathname.endsWith('/daily-comparison')) {
        if (req.method() === 'GET') {
          if (holdLatest) { holdLatest = false; await new Promise(resolve => { releaseLatest = resolve; }); }
          return route.fulfill({ json: { comparison: saved } });
        }
        const payload = req.postDataJSON(); writes.push(payload);
        if (holdSave) { holdSave = false; await new Promise(resolve => { releaseSave = resolve; }); }
        if (failSave) return route.fulfill({ status: 503, json: { message: 'Contoh simpan gagal.' } });
        if (conflict) { conflict = false; saved = { date: '2026-11-08', revision: 2, amounts: [{ method: 'CASH', amount: '123.00' }], posAtSave: [{ method: 'Belum dicatat', amount: '0.10' }, { method: 'CASH', amount: '100.25' }, { method: 'TRANSFER', amount: '0.10' }], savedAt: '2026-11-08T03:00:00.000Z', savedBy: 'Kasir lain' }; return route.fulfill({ status: 409, json: { message: 'Pemeriksaan sudah berubah.' } }); }
        saved = { date: payload.date, revision: (payload.revision ?? 0) + 1, amounts: payload.amounts, posAtSave: methods.map(row => ({ method: row.method, amount: row.amount.toFixed(2) })).sort((a, b) => a.method.localeCompare(b.method)), savedAt: '2026-11-08T04:00:00.000Z', savedBy: 'Kasir contoh' };
        return route.fulfill({ json: { comparison: saved, summary: { total: cashPos + 0.2, paymentMethods: methods } } });
      }
      return route.fulfill({ status: 404, json: {} });
    });
    const load = async query => { await page.goto(`http://comparison.local/${query || ''}`); await page.addScriptTag({ content: bundle.outputFiles[0].text }); };
    await load();
    const opener = page.getByRole('button', { name: 'Buka rincian' });
    await opener.click();
    let dialog = page.getByRole('dialog', { name: 'Rincian pemasukan' });
    await expect(dialog).toContainText('INV-OLD');
    assert.equal(requests.filter(row => row.path.endsWith('/daily-comparison')).length, 0);
    await dialog.locator('summary').filter({ hasText: 'Cocokkan penerimaan' }).click();
    await expect(dialog.getByLabel('Aktual Tunai (Rp)')).toBeVisible();
    await expect(dialog).toContainText('Belum dicatat');
    await expect(dialog).toContainText('Belum dicek');
    if (width === 390) {
      await dialog.getByLabel('Aktual Tunai (Rp)').fill('0');
      holdSave = true;
      await dialog.getByRole('button', { name: 'Simpan pemeriksaan' }).click();
      await expect.poll(() => typeof releaseSave).toBe('function');
      await dialog.getByLabel('Aktual Tunai (Rp)').fill('25');
      releaseSave();
      await expect(dialog.getByRole('button', { name: 'Simpan pemeriksaan' })).toBeEnabled();
      await expect(dialog.getByLabel('Aktual Tunai (Rp)')).toHaveValue('25');
      failReceipt = true;
      await dialog.getByRole('button', { name: 'Simpan pemeriksaan' }).click();
      await expect(dialog.getByRole('alert')).toContainText('Rincian contoh belum dapat dimuat.');
      await dialog.getByRole('button', { name: 'Coba lagi' }).click();
      await expect(dialog.getByLabel('Aktual Tunai (Rp)')).toHaveValue('25.00');
      await dialog.getByLabel('Aktual Tunai (Rp)').fill('30');
      failReceipt = true;
      await dialog.getByRole('button', { name: 'Simpan pemeriksaan' }).click();
      await expect(dialog.getByRole('alert')).toContainText('Rincian contoh belum dapat dimuat.');
      denyReceipt = true;
      await dialog.getByRole('button', { name: 'Coba lagi' }).click();
      await expect(dialog.getByRole('alert')).toContainText('Akses rincian belum diizinkan.');
      await dialog.getByRole('button', { name: 'Coba lagi' }).click();
      await dialog.locator('summary').filter({ hasText: 'Cocokkan penerimaan' }).click();
      await expect(dialog.getByLabel('Aktual Tunai (Rp)')).toHaveValue('30.00');
      conflict = true;
      await dialog.getByLabel('Aktual Tunai (Rp)').fill('31');
      await dialog.getByRole('button', { name: 'Simpan pemeriksaan' }).click();
      await expect(dialog.getByRole('button', { name: 'Muat versi terbaru' })).toBeVisible();
      holdLatest = true;
      await dialog.getByRole('button', { name: 'Muat versi terbaru' }).click();
      await expect.poll(() => typeof releaseLatest).toBe('function');
      await dialog.getByLabel('Aktual Transfer (Rp)').fill('55');
      releaseLatest();
      await expect(dialog).toContainText('Versi terbaru dimuat');
      await expect(dialog.getByLabel('Aktual Transfer (Rp)')).toHaveValue('55');
      conflict = true;
      await dialog.getByRole('button', { name: 'Simpan pemeriksaan' }).click();
      await dialog.getByRole('button', { name: 'Muat versi terbaru' }).click();
      await expect(dialog).toContainText('Versi terbaru dimuat');
      await expect(dialog.getByLabel('Aktual Transfer (Rp)')).toHaveValue('55');
      await expect(dialog.getByLabel('Aktual Tunai (Rp)')).toHaveValue('31');
      await page.keyboard.press('Escape');
      saved = null; writes.length = 0;
      await opener.click(); dialog = page.getByRole('dialog', { name: 'Rincian pemasukan' });
      await dialog.locator('summary').filter({ hasText: 'Cocokkan penerimaan' }).click();
      await expect(dialog.getByLabel('Aktual Tunai (Rp)')).toBeVisible();
    }
    await dialog.getByLabel('Aktual Tunai (Rp)').fill('0');
    await expect(dialog).toContainText('Kurang Rp');
    await dialog.getByLabel('Tambah metode pembayaran').selectOption('QRIS');
    await dialog.getByLabel('Aktual QRIS (Rp)').fill('50');
    await expect(dialog).toContainText('Lebih Rp');
    await dialog.getByRole('button', { name: 'Simpan pemeriksaan' }).click();
    await expect(dialog).toContainText('Kasir contoh');
    assert.deepEqual(writes[0], { date: '2026-11-08', revision: null, amounts: [{ method: 'CASH', amount: '0.00' }, { method: 'QRIS', amount: '50.00' }] });
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
    cashPos = 110.25;
    await opener.click(); dialog = page.getByRole('dialog', { name: 'Rincian pemasukan' });
    await dialog.locator('summary').filter({ hasText: 'Cocokkan penerimaan' }).click();
    await expect(dialog.getByLabel('Aktual Tunai (Rp)')).toHaveValue('0.00');
    await expect(dialog).toContainText('Data POS berubah');
    await dialog.getByLabel('Aktual Tunai (Rp)').fill('90');
    conflict = true; await dialog.getByRole('button', { name: 'Simpan pemeriksaan' }).click();
    await expect(dialog.getByRole('alert')).toContainText('berubah');
    await expect(dialog.getByLabel('Aktual Tunai (Rp)')).toHaveValue('90');
    await dialog.getByLabel('Aktual Tunai (Rp)').fill('91');
    await expect(dialog.getByRole('button', { name: 'Muat versi terbaru' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Muat versi terbaru' }).click();
    await expect(dialog.getByLabel('Aktual Tunai (Rp)')).toHaveValue('91');
    await expect(dialog).toContainText('123');
    failSave = true; await dialog.getByRole('button', { name: 'Simpan pemeriksaan' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Contoh simpan gagal.');
    await expect(dialog.getByLabel('Aktual Tunai (Rp)')).toHaveValue('91');
    failSave = false; await dialog.getByRole('button', { name: 'Simpan pemeriksaan' }).click();
    await expect(dialog).toContainText('Kasir contoh');
    assert.equal(writes.at(-1).revision, 2);
    assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    await page.keyboard.press('Escape');
    await load('?preview=1'); await page.getByRole('button', { name: 'Buka rincian' }).click();
    dialog = page.getByRole('dialog', { name: 'Rincian pemasukan' });
    await dialog.locator('summary').filter({ hasText: 'Cocokkan penerimaan' }).click();
    await expect(dialog).toContainText('Kasir contoh');
    await expect(dialog.locator('input')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Simpan pemeriksaan' })).toHaveCount(0);
    assert.equal(requests.filter(row => row.path.endsWith('/daily-comparison')).at(-1).params.view, 'sales');
    assert.deepEqual(errors, []);
    await page.close();
    process.stdout.write(`PASS ${width}px: optional comparison, partial values, saves, stale POS and conflicts\n`);
  }
} finally { await browser.close(); }
