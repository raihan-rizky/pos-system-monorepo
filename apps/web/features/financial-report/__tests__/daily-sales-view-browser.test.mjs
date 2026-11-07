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
    build.onResolve({ filter: /\/(ReportExportMenu|TrendChart)$/ }, () => ({ path: 'dynamic-component', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ contents: name === 'role'
      ? `export function useRole(){const role=new URL(location.href).searchParams.get('role')||'OWNER';
        const limited=new URL(location.href).searchParams.has('limited');return {role,userId:'test-'+role,storeId:'store-example',authorizationFingerprint:role+'-'+limited,
        canAccess:()=>true,canPerform:target=>role==='OWNER'||(limited?target==='financial-report.daily-outstanding-dp':target.startsWith('financial-report.daily-'))};}`
      : name === 'dynamic' ? 'export default function dynamic(){return ()=>null}' : 'export const ReportExportMenu=()=>null;export const TrendChart=()=>null;' }));
  } }],
});
const sourceFiles = ['app/(main)/financial-report/page.tsx', 'features/financial-report/components/DailyIncomeReport.tsx', 'features/financial-report/components/KpiCard.tsx', 'features/financial-report/components/PaymentBreakdownCard.tsx', 'features/financial-report/components/RankedListCard.tsx', 'features/financial-report/components/ShiftReconciliationCard.tsx', 'features/financial-report/components/LossStokBreakdownCard.tsx'];
const sources = await Promise.all(sourceFiles.map(file => readFile(path.join(web, file), 'utf8')));
const theme = require('tailwindcss/loadConfig')(path.join(repo, 'packages/config/tailwind.config.ts'));
const css = await require('postcss')([require('tailwindcss')({ ...theme, content: sources.map(raw => ({ raw, extension: 'tsx' })) })]).process('@tailwind base; @tailwind utilities;', { from: undefined });
const html = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contoh laporan harian</title><style>${css.css}body{font-family:system-ui,sans-serif;background:#f8fafc}</style><body><div id="root"></div></body></html>`;
const output = path.join(repo, 'output/playwright/daily-sales-view');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    const requests = [];
    let fail = false;
    let restrict = false;
    let salesFull = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-11-07T03:00:00Z') });
    await page.route('http://daily-sales.test/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/finance/report/daily') {
        requests.push(Object.fromEntries(url.searchParams));
        if (fail) return route.fulfill({ status: 503, json: { message: 'Laporan contoh belum dapat dimuat.' } });
        if (salesFull && url.searchParams.get('view') === 'sales') return route.fulfill({ json: { date: url.searchParams.get('date'), viewMode: 'full' } });
        const limited = restrict || new URL(page.url()).searchParams.has('limited');
        const json = { date: url.searchParams.get('date'), outstandingDp: 25000 };
        if (!limited) Object.assign(json, { total: 25000, categories: [{ category: 'Percetakan', amount: 25000 }], subcategories: [{ category: 'Percetakan', subcategory: 'Spanduk', amount: 25000 }], paymentMethods: [{ method: 'CASH', amount: 25000 }] });
        return route.fulfill({ json });
      }
      if (url.pathname === '/api/finance/report') {
        requests.push({ full: true });
        return route.fulfill({ json: { dateFrom: '2026-11-01', dateTo: '2026-11-07', summary: { revenue: 50000, collected: 25000, outstandingDp: 25000 }, topProducts: [], salespersons: [], categories: [], subcategories: [], paymentMethods: [], shifts: [], lossStok: [], trend: [] } });
      }
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
    await expect(page.getByText(/Rp\s*25\.000/, { exact: true })).toHaveCount(5);
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
    assert.deepEqual(errors, []);
    process.stdout.write(`PASS ${width}px: toggle, keyboard/focus, same daily API, dates, independent grants, error/retry, mobile overflow\n`);
    await page.close();
  }
} finally { await browser.close(); }
