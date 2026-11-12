import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repo = process.cwd();
const web = path.join(repo, 'apps/web');
const require = createRequire(path.join(web, 'package.json'));
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('vitest')] }));
const { chromium, expect } = require('@playwright/test');
const bundle = await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import Page from './app/(main)/keuangan/page';createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Page/></QueryClientProvider>);`, resolveDir: web, loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  alias: { '@': web, '@pos/ui': path.join(repo, 'packages/ui/src/index.ts') }, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'income-dialog-boundaries', setup(builder) {
    builder.onResolve({ filter: /providers\/RoleProvider$|^next\/(navigation|link|dynamic)$|\/(SupplierPayablesPanel|DeferredCashFlowChart|ManualIncomePanel)$/ }, ({ path: name }) => ({ path: name, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ resolveDir: web, loader: 'tsx', contents:
      name.endsWith('RoleProvider') ? `import React from 'react';export function useRole(){const [session,setSession]=React.useState(()=>({...window.__testSession}));React.useEffect(()=>{const update=()=>setSession({...window.__testSession});window.addEventListener('test-session',update);return()=>window.removeEventListener('test-session',update)},[]);return {role:'OWNER',userId:'user-'+session.identity,storeId:'store-'+session.identity,authorizationFingerprint:session.identity+'-'+session.history,canAccess:path=>path!=='/history'||session.history,canPerform:()=>true}}` :
      name === 'next/navigation' ? `export const useSearchParams=()=>new URLSearchParams('month=2026-11');export const usePathname=()=>'/keuangan';` :
      name === 'next/link' ? `import React from 'react';export default function Link(props){return <a {...props}/>}` :
      name === 'next/dynamic' ? `export default function dynamic(){return ()=>null}` :
      name.endsWith('SupplierPayablesPanel') ? `export const SupplierPayablesPanel=()=>null;` :
      name.endsWith('ManualIncomePanel') ? `export const ManualIncomePanel=()=>null;` : `export const DeferredCashFlowChart=()=>null;` }));
  } }],
});
const sourceFiles = ['apps/web/app/(main)/keuangan/page.tsx', 'apps/web/features/keuangan/components/IncomeDayRow.tsx', 'apps/web/features/financial-report/components/DailyIncomeReceiptDialog.tsx'];
const sources = await Promise.all(sourceFiles.map(file => readFile(path.join(repo, file), 'utf8')));
const theme = require('tailwindcss/loadConfig')(path.join(repo, 'packages/config/tailwind.config.ts'));
const css = await require('postcss')([require('tailwindcss')({ ...theme, content: sources.map(raw => ({ raw, extension: 'tsx' })) })]).process('@tailwind base;@tailwind utilities;', { from: undefined });
const html = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}body{font-family:system-ui,sans-serif}</style><body><div id="root"></div><script>window.__testSession={identity:'A',history:true}</script></body></html>`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const { width, timezoneId } of [{ width: 390, timezoneId: 'UTC' }, ...[1280, 390, 320].map(width => ({ width, timezoneId: 'Asia/Jakarta' }))]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, timezoneId });
    const errors = [], requests = [];
    let failReceipt = false, holdReceipt = false, releaseHeldReceipt;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://finance.local/**', async route => {
      const url = new URL(route.request().url());
      if (!url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'text/html', body: html });
      requests.push({ path: url.pathname, params: Object.fromEntries(url.searchParams) });
      if (url.pathname === '/api/history/receipts') {
        if (failReceipt) return route.fulfill({ status: 503, json: { message: 'Contoh rincian belum tersedia.' } });
        const date = url.searchParams.get('dateFrom');
        const first = date === '2026-11-08';
        const json = { mode: 'receipt', dateFrom: date, dateTo: date, items: first ? [{ transactionId: 'old', invoiceNumber: 'INV-OLD', date, amount: 13500, methods: ['CASH'], paymentBreakdown: [{ method: 'CASH', amount: 13500 }], categoryBreakdown: [{ category: 'ATK', amount: 13500 }] }] : [], manualDetailsAvailable: true, manualEntries: first ? [] : [{ id: 'manual', description: 'Pemasukan contoh', date, amount: 21000, methods: ['TRANSFER'], paymentBreakdown: [{ method: 'TRANSFER', amount: 21000 }], categoryBreakdown: [{ category: 'Percetakan', amount: 21000 }] }], summary: { total: first ? 13500 : 21000, paymentMethods: [{ method: first ? 'CASH' : 'TRANSFER', amount: first ? 13500 : 21000 }] }, comparisonAccess: { read: true, create: true, update: true } };
        if (holdReceipt) { holdReceipt = false; return new Promise(resolve => { releaseHeldReceipt = async () => { try { await route.fulfill({ json }); } catch {} resolve(); }; }); }
        return route.fulfill({ json });
      }
      if (url.pathname.endsWith('/income/summary')) return route.fulfill({ json: { month: '2026-11', monthlyTotal: 34500, transactionCount: 1, manualEntryCount: 1, daily: [{ date: '2026-11-08', total: 13500, count: 1, manualCount: 0 }, { date: '2026-11-09', total: 21000, count: 0, manualCount: 1 }] } });
      if (url.pathname.endsWith('/cash-flow/summary')) return route.fulfill({ json: { income: { total: 34500, daily: [] }, expense: { total: 0, incomplete: false, daily: [] } } });
      if (url.pathname.endsWith('/expenses/summary')) return route.fulfill({ json: { monthlyTotal: 0, entryCount: 0, byCategory: [], daily: [] } });
      return route.fulfill({ json: { data: [], pagination: { page: 1, total: 0, totalPages: 0 } } });
    });
    await page.goto('http://finance.local/keuangan');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const day8 = page.getByRole('button', { name: /08 Nov 2026/ });
    const day9 = page.getByRole('button', { name: /09 Nov 2026/ });
    await expect(day8).toBeVisible();
    assert.equal(requests.filter(row => row.path === '/api/history/receipts').length, 0);
    await day8.focus(); await page.keyboard.press('Enter');
    let dialog = page.getByRole('dialog', { name: 'Rincian pemasukan' });
    await expect(dialog).toContainText('8 November 2026');
    await expect(dialog).toContainText('13.500');
    await expect(dialog).toContainText('INV-OLD');
    await expect(dialog).toContainText('1 nota terlihat');
    await dialog.getByRole('button', { name: 'Rincian INV-OLD' }).click();
    await expect(dialog).toContainText('ATK');
    assert.deepEqual(requests.filter(row => row.path === '/api/history/receipts').at(-1).params, { mode: 'receipt', dateFrom: '2026-11-08', dateTo: '2026-11-08' });
    await expect(dialog.locator('input')).toHaveCount(0);
    await expect(dialog.getByText('Cocokkan penerimaan')).toHaveCount(0);
    assert.equal(requests.some(row => row.path.includes('daily-comparison')), false);
    assert.equal(new URL(page.url()).pathname, '/keuangan');
    assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(day8).toBeFocused();
    await day9.click();
    await expect(dialog).toContainText('9 November 2026');
    await expect(dialog).toContainText('Pemasukan contoh');
    await expect(dialog).toContainText('21.000');
    await expect(dialog).not.toContainText('INV-OLD');
    await page.keyboard.press('Escape');

    holdReceipt = true; await day8.click();
    await expect(dialog.getByRole('status')).toContainText('Memuat');
    await expect.poll(() => typeof releaseHeldReceipt).toBe('function');
    await page.keyboard.press('Escape'); await day9.click();
    await expect(dialog).toContainText('Pemasukan contoh');
    await releaseHeldReceipt(); await expect(dialog).not.toContainText('INV-OLD');
    await page.keyboard.press('Escape');

    failReceipt = true; await day8.click();
    await expect(dialog.getByRole('alert')).toContainText('Contoh rincian belum tersedia.');
    failReceipt = false; await dialog.getByRole('button', { name: 'Coba lagi' }).click();
    await expect(dialog).toContainText('INV-OLD');
    await page.evaluate(() => { window.__testSession.identity = 'B'; window.dispatchEvent(new Event('test-session')); });
    await expect(dialog).toHaveCount(0);
    await day8.click(); await expect(dialog).toContainText('INV-OLD');
    await page.evaluate(() => { window.__testSession.history = false; window.dispatchEvent(new Event('test-session')); });
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: /08 Nov 2026/ })).toHaveCount(0);
    assert.deepEqual(errors, []);
    await page.close();
    process.stdout.write(`PASS ${width}px ${timezoneId}: selected day, receipt details, access, focus, retries and stale responses\n`);
  }
} finally { await browser.close(); }
