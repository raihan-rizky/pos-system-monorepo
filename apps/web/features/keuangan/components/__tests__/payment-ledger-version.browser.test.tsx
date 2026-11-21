import { createRequire } from 'node:module';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe.skipIf(process.env.FINANCE_BROWSER_TEST !== '1')('versi ledger formulir pembayaran di browser', () => {
  let browser: Browser;
  let script: string;
  beforeAll(async () => {
    const requireFromVitest = createRequire(require.resolve('vitest/package.json'));
    const { build } = requireFromVitest('esbuild') as { build: (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
    const bundle = await build({
      stdin: { contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
        import { RoleProvider } from './components/providers/RoleProvider';
        import { GiroPanel } from './features/keuangan/components/GiroPanel';
        import { SupplierPayablesPanel } from './features/keuangan/components/SupplierPayablesPanel';
        const manual = location.pathname.includes('manual');
        const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300000 } } });
        window.ledgerVersion = '7';
        window.sent = [];
        window.fetch = async (_url, options) => {
          if (options?.method === 'POST') {
            const body = JSON.parse(options.body); window.sent.push({ ...body, url:_url });
            if (location.pathname.includes('orphan')) {
              if (String(_url).includes('reserve=1')) return new Response(JSON.stringify({ reserved:true }), { status:200 });
              if (String(_url).includes('resolve=1')) return new Response(JSON.stringify({ code:'BalanceChanged', message:'Saldo hutang telah berubah.' }), { status:409 });
              return new Response('', { status:403 });
            }
            if (String(_url).includes('reserve=1')) return new Response(JSON.stringify({ reserved:true }), { status:200 });
            return body.expectedLedgerVersion === window.ledgerVersion
              ? new Response(JSON.stringify({ success:true }), { status:201 })
              : new Response(JSON.stringify({ code:'BalanceChanged', message:'Saldo hutang telah berubah.' }), { status:409 });
          }
          const manualData = { items:[{ id:'debt',supplierName:'Pemasok',amount:1000.5,paid:0,debtDate:'2026-01-01',dueDate:null,note:null,reportCategory:null,ledgerVersion:window.ledgerVersion }],page:1,total:1 };
          const giroData = { items:[{ goodsPurchaseId:'purchase',number:'G-1',supplierName:'Pemasok',amount:1000.5,debtDate:'2026-01-01',dueDate:null,payableId:'debt',status:'UNPAID',paid:0,remaining:1000.5,payments:[],ledgerVersion:window.ledgerVersion }],manualPayables:[] };
          return new Response(JSON.stringify(location.pathname.includes('orphan') ? { items: [], manualPayables: [] } : manual ? manualData : giroData), {status:200});
        };
        createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><RoleProvider role="ADMIN" userId="user-1" userName="Pengguna" storeId="store-1" authorizationFingerprint="auth"><main>{manual ? <SupplierPayablesPanel canCreate={false} canUpdate canReadGiro={false} /> : <GiroPanel canUpdate />}</main></RoleProvider></QueryClientProvider>);
      `, resolveDir: process.cwd(), sourcefile: 'ledger-browser.tsx', loader: 'tsx' },
      plugins: [{ name: 'stubs', setup(plugin: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: string; resolveDir: string }) => void }) {
        plugin.onResolve({ filter: /^(lucide-react|@pos\/ui|@\/lib\/utils)$/ }, args => ({ path: args.path, namespace: 'stub' }));
        plugin.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: args.path === 'lucide-react' ? 'export const Plus = () => null; export const X = () => null;' : args.path === '@pos/ui' ? "import React from 'react'; export const Button = ({children,icon,variant,loading,...props}) => <button {...props}>{children}</button>;" : "export const formatRupiah = value => 'Rp ' + value;", loader: 'jsx', resolveDir: process.cwd() }));
      } }],
      alias: { '@': process.cwd() }, jsx: 'automatic', bundle: true, write: false, platform: 'browser', format: 'iife',
    });
    script = bundle.outputFiles[0].text;
    browser = await chromium.launch({ headless: true });
  }, 60_000);
  afterAll(async () => { await browser?.close(); });

  it.each(['manual', 'giro'])('sends the version captured when opening a %s payment and refuses a stale form', async kind => {
    const page = await browser.newPage();
    try {
      await page.route('http://localhost:9997/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
      await page.goto(`http://localhost:9997/${kind}`);
      await page.addScriptTag({ content: script });
      await page.getByRole('button', { name: 'Catat pembayaran', exact: true }).click();
      await page.getByLabel('Nominal pembayaran (Rp)').fill('300.25');
      await page.evaluate(() => { (window as unknown as { ledgerVersion: string }).ledgerVersion = '9'; });
      await page.getByRole('button', { name: 'Simpan pembayaran' }).click();
      await page.getByRole('alert').getByText('Saldo hutang telah berubah.').waitFor();
      const sent = await page.evaluate(() => (window as unknown as { sent: Array<{ expectedLedgerVersion: string; expectedBalance: string }> }).sent);
      expect(sent).toHaveLength(2);
      expect(sent[0]).toMatchObject({ expectedLedgerVersion: '7', expectedBalance: '1000.5' });
      expect(await page.getByRole('button', { name: 'Simpan pembayaran' }).isDisabled()).toBe(true);
    } finally { await page.close(); }
  }, 20_000);

  it('offers recovery for a giro payment even when the giro disappeared from the list', async () => {
    const page = await browser.newPage();
    try {
      await page.route('http://localhost:9997/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
      await page.goto('http://localhost:9997/orphan');
      await page.evaluate(() => localStorage.setItem(`giro-payment:${JSON.stringify(['store-1','user-1','debt'])}`, JSON.stringify({ key:'b14f880a-fb50-43bc-a2aa-4733c8811dad', amount:'300.25', paidAt:'2026-10-11', expectedBalance:'1000.5', expectedLedgerVersion:'7', resource:'GIRO' })));
      await page.addScriptTag({ content: script });
      await page.getByRole('button', { name: 'Pastikan pembayaran' }).click();
      expect(await page.locator('dialog[open]').count()).toBe(1);
      expect(await page.getByLabel('Nominal pembayaran (Rp)').inputValue()).toBe('300.25');
      await page.getByRole('button', { name: 'Pastikan pembayaran', exact: true }).last().click();
      await page.getByRole('alert').getByText('Saldo hutang telah berubah.').waitFor();
      expect(await page.evaluate(() => localStorage.getItem(`giro-payment:${JSON.stringify(['store-1','user-1','debt'])}`))).toBeNull();
      const sent = await page.evaluate(() => (window as unknown as { sent: Array<{ url: string }> }).sent);
      expect(sent.map(item => item.url)).toEqual([expect.stringContaining('reserve=1'), expect.not.stringContaining('?'), expect.stringContaining('resolve=1')]);
    } finally { await page.close(); }
  }, 20_000);
});
