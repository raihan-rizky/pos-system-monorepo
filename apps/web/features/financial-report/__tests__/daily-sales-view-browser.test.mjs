// Exercise the real page and query hooks with synthetic reports at the HTTP boundary.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const repo = process.cwd();
const web = path.join(repo, 'apps/web');
const require = createRequire(path.join(web, 'package.json'));
const { build } = require(require.resolve('esbuild', { paths: [path.join(repo, 'node_modules/.pnpm/node_modules')] }));
const { chromium, expect } = require('@playwright/test');
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import Page from './app/(main)/financial-report/page';
    const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><Page/></QueryClientProvider>);`, resolveDir: web, loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  alias: { '@': web }, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'daily-report-boundaries', setup(build) {
    build.onResolve({ filter: /providers\/RoleProvider$/ }, () => ({ path: 'role', namespace: 'fixture' }));
    build.onResolve({ filter: /next\/dynamic$/ }, () => ({ path: 'dynamic', namespace: 'fixture' }));
    build.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
    build.onResolve({ filter: /\/(ReportExportMenu|TrendChart)$/ }, () => ({ path: 'dynamic-component', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: name === 'role'
      ? `import {useEffect,useState} from 'react';export function useRole(){const [identity,setIdentity]=useState(window.__receiptTestIdentity||'A');
        useEffect(()=>{const update=()=>setIdentity(window.__receiptTestIdentity||'A');window.addEventListener('receipt-test-identity-change',update);return()=>window.removeEventListener('receipt-test-identity-change',update)},[]);
        const role=new URL(location.href).searchParams.get('role')||'OWNER';
        const limited=new URL(location.href).searchParams.has('limited');return {role,userId:'test-'+role+'-'+identity,storeId:'store-'+identity,authorizationFingerprint:role+'-'+limited+'-'+identity,
        canAccess:()=>true,canPerform:target=>role==='OWNER'||target==='transaction'||(limited?target==='financial-report.daily-outstanding-dp':target.startsWith('financial-report.daily-'))};}`
      : name === 'link' ? 'import React from "react"; export default function Link({href,children,...props}){return React.createElement("a",{href,...props},children)}'
      : name === 'dynamic' ? 'export default function dynamic(){return ()=>null}' : 'export const ReportExportMenu=()=>null;export const TrendChart=()=>null;', resolveDir: web }));
  } }],
});
const sourceFiles = ['app/(main)/financial-report/page.tsx', 'features/financial-report/components/DailyIncomeReport.tsx', 'features/financial-report/components/DailyIncomeReceiptDialog.tsx', 'features/financial-report/components/KpiCard.tsx', 'features/financial-report/components/PaymentBreakdownCard.tsx', 'features/financial-report/components/RankedListCard.tsx', 'features/financial-report/components/ShiftReconciliationCard.tsx', 'features/financial-report/components/LossStokBreakdownCard.tsx'];
const sources = await Promise.all(sourceFiles.map(file => readFile(path.join(web, file), 'utf8')));
const theme = require('tailwindcss/loadConfig')(path.join(repo, 'packages/config/tailwind.config.ts'));
const css = await require('postcss')([require('tailwindcss')({ ...theme, content: sources.map(raw => ({ raw, extension: 'tsx' })) })]).process('@tailwind base; @tailwind utilities;', { from: undefined });
const html = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contoh laporan harian</title><style>${css.css}body{font-family:system-ui,sans-serif;background:#f8fafc}</style><body><div id="root"></div></body></html>`;
const output = path.join(repo, 'output/playwright/receipt-reconciliation-20261111');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1280, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    const requests = [];
    let fail = false;
    let restrict = false;
    let salesFull = false;
    let receiptFail = false;
    let receiptEmpty = false;
    let holdReceipt = false;
    let releaseHeldReceipt;
    let identity = 'A';
    page.on('pageerror', error => { errors.push(error.message); process.stderr.write(`Browser error: ${error.message}\n`); });
    await page.clock.install({ time: new Date('2026-11-07T03:00:00Z') });
    await page.route('http://daily-sales.test/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/finance/report/daily') {
        requests.push(Object.fromEntries(url.searchParams));
        if (fail) return route.fulfill({ status: 503, json: { message: 'Laporan contoh belum dapat dimuat.' } });
        if (salesFull && url.searchParams.get('view') === 'sales') return route.fulfill({ json: { date: url.searchParams.get('date'), viewMode: 'full' } });
        const limited = restrict || new URL(page.url()).searchParams.has('limited');
        const json = { date: url.searchParams.get('date'), outstandingDp: 25000 };
        if (!limited) Object.assign(json, { total: 25000, categories: [{ category: 'Percetakan', amount: 25000 }], subcategories: [{ category: 'Percetakan', subcategory: 'Spanduk', amount: 25000 }], paymentMethods: [{ method: 'CASH', amount: 15000 }, { method: 'TRANSFER', amount: 10000 }] });
        if (url.searchParams.get('view') === 'sales') json.receiptHistoryAccess = { total: !limited, category: !limited, subcategory: !limited, method: !limited, outstandingDp: true };
        return route.fulfill({ json });
      }
      if (url.pathname === '/api/finance/report') {
        requests.push({ full: true });
        return route.fulfill({ json: { dateFrom: '2026-11-01', dateTo: '2026-11-07', summary: { revenue: 50000, collected: 25000, outstandingDp: 25000 }, topProducts: [], salespersons: [], categories: [], subcategories: [], paymentMethods: [], shifts: [], lossStok: [], trend: [] } });
      }
      if (url.pathname === '/api/history/receipts') {
        requests.push({ receipt: true, ...Object.fromEntries(url.searchParams) });
        if (receiptFail) return route.fulfill({ status: 503, json: { message: 'Rincian contoh belum dapat dimuat.' } });
        const manualDetailsAvailable = new URL(page.url()).searchParams.has('manual');
        const invoiceNumber = identity === 'B' ? 'INV-B' : url.searchParams.get('dateFrom') === '2026-11-05' ? 'INV-NEW' : 'INV-OLD';
        const items = receiptEmpty ? [] : [{ transactionId: 'old-invoice', invoiceNumber, date: url.searchParams.get('dateFrom'), amount: 16000, methods: ['CASH', 'TRANSFER'], paymentBreakdown: [{ method: 'CASH', amount: 6000 }, { method: 'TRANSFER', amount: 10000 }], categoryBreakdown: [{ category: 'Percetakan', amount: 16000 }] }];
        const manualEntries = receiptEmpty || !manualDetailsAvailable ? [] : [{ id: 'manual', description: 'Pemasukan contoh', date: url.searchParams.get('dateFrom'), amount: 10000, methods: ['CASH'], paymentBreakdown: [{ method: 'CASH', amount: 10000 }], categoryBreakdown: [{ category: 'Percetakan', amount: 10000 }] }];
        const summary = receiptEmpty ? { total: 0, paymentMethods: [] } : { total: 26000, paymentMethods: [{ method: 'CASH', amount: 16000 }, { method: 'TRANSFER', amount: 10000 }] };
        const ownerView = (new URL(page.url()).searchParams.get('role') || 'OWNER') === 'OWNER' && url.searchParams.get('view') !== 'sales';
        const json = { mode: 'receipt', dateFrom: url.searchParams.get('dateFrom'), dateTo: url.searchParams.get('dateTo'), items, manualDetailsAvailable, summary, comparisonAccess: { read: ownerView, create: ownerView, update: ownerView }, ...(manualDetailsAvailable ? { manualEntries } : {}) };
        if (holdReceipt) {
          holdReceipt = false;
          return new Promise(resolve => { releaseHeldReceipt = async () => { try { await route.fulfill({ json }); } catch {} resolve(); }; });
        }
        return route.fulfill({ json });
      }
      if (url.pathname === '/api/finance/report/daily-comparison') return route.fulfill({ json: { comparison: null } });
      return route.fulfill({ contentType: 'text/html', body: html });
    });
    const load = async (query = '') => { await page.goto(`http://daily-sales.test/${query}`); await page.addScriptTag({ content: bundle.outputFiles[0].text }); };
    await load();
    const sales = page.getByRole('button', { name: 'Lihat sebagai Sales', exact: true });
    await expect(sales).toHaveAttribute('aria-pressed', 'false');
    await sales.focus();
    await page.keyboard.press('Enter');
    await expect(sales).toHaveAttribute('aria-pressed', 'true');
    await expect(sales).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Pemasukan Harian', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Outstanding DP', exact: true })).toBeVisible();
    await expect(page.getByText(/Rp\s*25\.000/, { exact: true })).toHaveCount(4);
    await expect(page.getByRole('heading', { name: 'Sales Teratas' })).toHaveCount(0);
    assert.equal(requests.at(-1).view, 'sales');
    assert.equal(requests.at(-1).date, '2026-11-07');
    assert.equal(requests.at(-1).storeId, undefined);
    assert.equal(await page.locator('main').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, `sales-${width}.png`) });
    if (width === 1280) await page.locator('#root').screenshot({ path: path.join(output, 'sales-crop.png') });
    await page.getByLabel('Tanggal pemasukan').fill('2026-11-06');
    await expect.poll(() => requests.at(-1).date).toBe('2026-11-06');
    const totalButton = page.getByRole('button', { name: /Lihat rincian Total Pemasukan/ });
    assert.equal(requests.filter(row => row.receipt).length, 0, 'receipt details are fetched only when opened');
    await totalButton.focus(); await page.keyboard.press('Enter');
    let dialog = page.getByRole('dialog', { name: 'Rincian pemasukan' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('INV-OLD');
    await expect(dialog).toContainText('Rp 26.000');
    await expect(dialog).not.toContainText('Rp 25.000');
    await expect(dialog).toContainText('1 nota terlihat');
    await expect(dialog).toContainText(/sebagian rincian pemasukan belum tersedia/i);
    assert.deepEqual(Object.fromEntries(Object.entries(requests.filter(row => row.receipt).at(-1)).filter(([key]) => ['dateFrom', 'dateTo', 'view'].includes(key))), { dateFrom: '2026-11-06', dateTo: '2026-11-06', view: 'sales' });
    await expect(dialog.getByRole('link', { name: 'INV-OLD' })).toHaveCount(0);
    const expand = dialog.getByRole('button', { name: 'Rincian INV-OLD' });
    await expand.click(); await expect(expand).toHaveAttribute('aria-expanded', 'true');
    await expect(dialog).toContainText('Rp 6.000');
    await expect(dialog).toContainText('Rp 10.000');
    await expect(dialog).toContainText('Percetakan');
    assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    if (width === 320) {
      const invoice = await dialog.getByText('INV-OLD', { exact: true }).boundingBox();
      assert(invoice && invoice.height <= 24, 'invoice number remains readable on one line at 320px');
    }
    await dialog.screenshot({ path: path.join(output, `receipt-dialog-${width}.png`) });
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(totalButton).toBeFocused();

    holdReceipt = true;
    await totalButton.click();
    await expect(dialog.getByRole('status')).toContainText('Memuat rincian pemasukan');
    await expect.poll(() => typeof releaseHeldReceipt).toBe('function');
    await page.keyboard.press('Escape');
    await page.getByLabel('Tanggal pemasukan').fill('2026-11-05');
    await expect.poll(() => requests.at(-1).date).toBe('2026-11-05');
    await totalButton.click();
    await expect(dialog).toContainText('INV-NEW');
    await releaseHeldReceipt();
    await expect(dialog).not.toContainText('INV-OLD');
    await page.keyboard.press('Escape');
    await page.getByLabel('Tanggal pemasukan').fill('2026-11-06');
    await expect.poll(() => requests.at(-1).date).toBe('2026-11-06');

    receiptFail = true;
    await page.getByRole('button', { name: 'Lihat rincian pemasukan', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Rincian pemasukan' });
    await expect(dialog.getByRole('alert')).toContainText('Rincian contoh belum dapat dimuat.');
    receiptFail = false;
    await dialog.getByRole('button', { name: 'Coba lagi', exact: true }).click();
    await expect(dialog).toContainText('INV-OLD');
    await page.keyboard.press('Escape');
    receiptEmpty = true;
    await totalButton.click();
    await expect(dialog).toContainText('Belum ada penerimaan yang dapat ditampilkan pada tanggal ini.');
    await page.keyboard.press('Escape');
    receiptEmpty = false;
    await load();
    await page.getByRole('button', { name: 'Pemasukan Harian', exact: true }).click();
    await page.getByRole('button', { name: /Lihat rincian Total Pemasukan/ }).click();
    dialog = page.getByRole('dialog', { name: 'Rincian pemasukan' });
    await dialog.locator('summary').filter({ hasText: 'Cocokkan penerimaan' }).click();
    await expect(dialog.getByLabel('Aktual Tunai (Rp)')).toBeVisible();
    await page.keyboard.press('Escape');
    receiptEmpty = false;
    await page.getByRole('button', { name: /Lihat rincian Total Pemasukan/ }).click();
    await expect(dialog).toContainText('INV-OLD');
    identity = 'B';
    const dailyRequestsBeforeIdentityChange = requests.filter(row => !row.receipt && !row.full).length;
    await page.evaluate(() => { window.__receiptTestIdentity = 'B'; window.dispatchEvent(new Event('receipt-test-identity-change')); });
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => requests.filter(row => !row.receipt && !row.full).length).toBeGreaterThan(dailyRequestsBeforeIdentityChange);
    await page.getByRole('button', { name: /Lihat rincian Total Pemasukan/ }).click();
    await expect(dialog).toContainText('INV-B');
    await expect(dialog).not.toContainText('INV-OLD');
    await page.keyboard.press('Escape');
    identity = 'A';
    const dailyRequestsBeforeReset = requests.filter(row => !row.receipt && !row.full).length;
    await page.evaluate(() => { window.__receiptTestIdentity = 'A'; window.dispatchEvent(new Event('receipt-test-identity-change')); });
    await expect.poll(() => requests.filter(row => !row.receipt && !row.full).length).toBeGreaterThan(dailyRequestsBeforeReset);
    receiptEmpty = false;
    await expect(page.getByRole('link', { name: /Lihat rincian Percetakan \/ Spanduk/ })).toHaveAttribute('href', /subcategory=Spanduk/);
    await expect(page.getByRole('link', { name: /Lihat rincian Outstanding DP/ })).toHaveAttribute('href', /mode=outstanding-dp/);
    fail = true;
    await page.getByRole('button', { name: 'Muat ulang pemasukan harian' }).click();
    await expect(page.getByRole('alert')).toContainText('Laporan contoh belum dapat dimuat.');
    await expect(page.getByRole('heading', { name: 'Outstanding DP', exact: true })).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Outstanding DP', exact: true })).toBeVisible();
    const full = page.getByRole('button', { name: 'Laporan Lengkap', exact: true });
    await full.focus(); await page.keyboard.press('Space');
    await expect(full).toHaveAttribute('aria-pressed', 'true');
    await expect(full).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Laporan Keuangan', exact: true })).toBeVisible();
    restrict = true;
    await sales.click();
    await expect(page.getByRole('heading', { name: 'Outstanding DP', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Total Pemasukan', exact: true })).toHaveCount(0);
    await full.click();
    salesFull = true;
    await sales.click();
    await expect(sales).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Laporan Keuangan', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pemasukan Harian', exact: true })).toHaveCount(0);
    await load('?role=SALES&limited=1');
    const beforeSales = requests.filter(row => row.full).length;
    await expect(page.getByRole('heading', { name: 'Outstanding DP', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Total Pemasukan', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Lihat sebagai Sales', exact: true })).toHaveCount(0);
    assert.equal(requests.filter(row => row.full).length, beforeSales);
    assert.equal(requests.at(-1).view, undefined);
    restrict = false; salesFull = false;
    await load('?role=SALES&manual=1');
    await page.getByLabel('Tanggal pemasukan').fill('2026-11-06');
    await page.getByRole('button', { name: /Lihat rincian Total Pemasukan/ }).click();
    dialog = page.getByRole('dialog', { name: 'Rincian pemasukan' });
    await expect(dialog).toContainText('1 pemasukan manual terlihat');
    await expect(dialog).toContainText('Pemasukan contoh');
    await expect(dialog.getByRole('link', { name: 'INV-OLD' })).toHaveAttribute('href', /\/history\?search=INV-OLD/);
    await dialog.getByRole('button', { name: 'Rincian Pemasukan contoh' }).click();
    await expect(dialog).toContainText('Rp 10.000');
    if (width === 1280) await dialog.screenshot({ path: path.join(output, 'receipt-dialog-complete.png') });
    assert.equal(new URL(page.url()).pathname, '/');
    await page.keyboard.press('Escape');
    receiptEmpty = true;
    await page.getByRole('button', { name: /Lihat rincian Total Pemasukan/ }).click();
    await expect(dialog).toContainText('Belum ada penerimaan yang dapat ditampilkan pada tanggal ini.');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    process.stdout.write(`PASS ${width}px: toggle, keyboard/focus, same daily API, dates, independent grants, error/retry, mobile overflow\n`);
    await page.close();
  }
} finally { await browser.close(); }
