import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const repo = process.cwd();
const web = path.join(repo, 'apps/web');
const require = createRequire(path.join(web, 'package.json'));
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('vitest')] }));
const { chromium } = require('@playwright/test');
const scenario = process.argv[2] ?? 'all';
const bundle = await build({
  stdin: { resolveDir: web, loader: 'tsx', contents: `
    import React, { useMemo, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
    import { RoleProvider } from '@/components/providers/RoleProvider';
    import { buildDefaultRolePermissions } from '@/features/rbac/helpers/rbac-core';
    import { ManualFinanceFormModal } from './features/keuangan/components/ManualFinanceFormModal';
    import { ReceivableCorrectionForm } from './features/customer-debt/components/ReceivableCorrectionForm';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300000 } } });
    function Screen() {
      const [screen, setScreen] = useState('closed');
      window.openScreen = value => setScreen(value);
      const initial = {id:'old-transfer', applicantName:'Pemasok Lama', description:'Draft lama', amount:100, occurredAt:'2026-11-10T00:00:00+07:00', updatedAt:'2026-11-10T00:00:00.000Z', reportCategory:'ATK', attachmentUrl:null};
      const entry = {id:'r1', customerId:'c1', customer:{id:'c1',name:'Pelanggan Asal'}, amount:100, amountPaid:0, debtDate:'2026-11-01', dueDate:'2026-11-30', reportCategory:'ATK', note:null, createdAt:'2026-11-01', updatedAt:'2026-11-01T00:00:00.000Z', payments:[]};
      return <>
        {screen.startsWith('transfer') && <ManualFinanceFormModal open kind="transfer" initial={screen==='transfer-edit'?initial:undefined} onClose={()=>setScreen('closed')} onSaved={()=>{}} />}
        {screen==='receivable' && <ReceivableCorrectionForm entry={entry} onClose={()=>setScreen('closed')} onSaved={()=>{}} />}
      </>;
    }
    function App() {
      const [session, setSession] = useState({ userId:'user-a', storeId:'store-a', authorizationFingerprint:'one', role:'CASHIER', customerRead:true, allocate:true });
      window.setSession = patch => setSession(current => ({...current,...patch}));
      const permissions = useMemo(() => {
        const result=buildDefaultRolePermissions();
        Object.keys(result.CASHIER.pages).forEach(key => result.CASHIER.pages[key]=true);
        Object.keys(result.CASHIER.resources).forEach(key => result.CASHIER.resources[key]={create:true,read:true,update:true,delete:true});
        result.CASHIER.resources.customer.read=session.customerRead;
        result.CASHIER.resources['expense.manual_transfer.allocation'].update=session.allocate;
        return result;
      }, [session.customerRead,session.allocate]);
      return <RoleProvider role={session.role} userId={session.userId} userName="Uji" storeId={session.storeId} authorizationFingerprint={session.authorizationFingerprint} permissions={permissions}><Screen /></RoleProvider>;
    }
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
  ` },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  alias: { '@': web, '@pos/ui': path.join(repo, 'packages/ui/src/index.ts') },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name:'role-provider-fixture', setup(builder) {
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path:'navigation', namespace:'fixture' }));
    builder.onResolve({ filter: /^@\/features\/rbac\/helpers\/permission-refresh$/ }, () => ({ path:'refresh', namespace:'fixture' }));
    builder.onLoad({ filter: /.*/, namespace:'fixture' }, ({path:name}) => ({ resolveDir:web, loader:'tsx', contents:name==='navigation' ? `export const usePathname=()=>'/keuangan';` : `export class PermissionRefreshError extends Error{}; export const startPermissionRefresh=()=>()=>{}; export const loadCurrentRoleAccess=async()=>{throw new Error('unexpected refresh')};` }));
  } }],
});

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(4000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let customerName = 'Pelanggan Toko A';
  let customerGets = 0;
  const corrections = [];
  let registrationResolve;
  let registrationSeenResolve;
  const registrationSeen = new Promise(resolve => { registrationSeenResolve = resolve; });
  let holdRegistration = false;
  let writes = 0;
  await page.route('http://localhost/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.fulfill({ contentType:'text/html', body:'<html><body><div id="root"></div></body></html>' });
    if (url.pathname === '/api/customers') { customerGets++; return route.fulfill({ json:{ data:[{id:'c2',name:customerName}],pagination:{page:1,total:1,totalPages:1} } }); }
    if (url.pathname === '/api/customer-receivables/r1' && request.method() === 'PATCH') { corrections.push(request.postDataJSON()); return route.fulfill({json:{success:true}}); }
    if (url.pathname.endsWith('/allocations')) return route.fulfill({ json:{ allocations:[{payableId:'old-payable',paymentId:'old-payment',amount:30,supplierName:'Pemasok Rahasia A',reportCategory:'ATK'}] } });
    if (url.pathname === '/api/finance/supplier-payables') return route.fulfill({ json:{ items:[],total:0 } });
    if (url.pathname.endsWith('/manual-transfer-attempts') && request.method()==='GET') return route.fulfill({ json:{attempts:[]} });
    if (url.pathname.endsWith('/manual-transfer-attempts') && request.method()==='POST' && holdRegistration) {
      registrationSeenResolve();
      await new Promise(resolve => { registrationResolve = resolve; });
      return route.fulfill({ json:{attempt:{}} }).catch(() => {});
    }
    if (url.pathname === '/api/finance/expenses' && request.method()==='POST') writes++;
    return route.fulfill({ json:{success:true} });
  });
  await page.goto('http://localhost/fixture');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.waitForFunction(() => typeof window.openScreen === 'function');
  await page.evaluate(() => window.openScreen('transfer-edit'));
  if (scenario === 'all' || scenario === 'transfer') {
  await page.getByText('Pemasok Rahasia A').waitFor();
  await page.evaluate(() => window.setSession({userId:'user-b',storeId:'store-b',authorizationFingerprint:'two'}));
  await page.getByText('Pemasok Rahasia A').waitFor({state:'hidden'});
  assert.equal(await page.locator('input[value="Pemasok Lama"]').count(), 0, 'the old transfer must close rather than be re-created for the new identity');

  await page.evaluate(() => window.setSession({userId:'user-a',storeId:'store-a',authorizationFingerprint:'one',allocate:true}));
  await page.waitForFunction(() => document.querySelector('[data-offline-auth-store]')?.getAttribute('data-offline-auth-store') === 'store-a');
  await page.evaluate(() => window.openScreen('transfer-edit'));
  await page.getByText('Pemasok Rahasia A').waitFor();
  await page.evaluate(() => window.setSession({allocate:false}));
  await page.getByText('Pemasok Rahasia A').waitFor({state:'hidden'});
  assert.equal(await page.locator('input[value="Pemasok Lama"]').count(), 0, 'revoked allocation permission must close the old draft');
  }

  if (scenario === 'all' || scenario === 'receivable') {
  await page.evaluate(() => window.setSession({allocate:true}));
  await page.evaluate(() => window.openScreen('receivable'));
  await page.getByRole('option', {name:'Pelanggan Toko A'}).waitFor({state:'attached'});
  await page.getByLabel('Pelanggan piutang').selectOption('c2');
  await page.evaluate(() => window.setSession({customerRead:false}));
  await page.getByRole('option', {name:'Pelanggan Toko A'}).waitFor({state:'detached'});
  assert.equal(await page.getByRole('option', {name:'Pelanggan Toko A'}).count(), 0, 'revoking customer.read must hide cached names');
  assert.equal(await page.getByLabel('Nominal piutang').isVisible(), true, 'other receivable corrections stay available');
  await Promise.all([page.waitForResponse('**/api/customer-receivables/r1'), page.getByRole('button', {name:'Simpan perubahan piutang'}).click()]);
  assert.equal(corrections.length, 1);
  assert.equal(Object.hasOwn(corrections[0], 'customerId'), false, 'revoked selection must not move the receivable');
  customerName = 'Pelanggan Toko B';
  await page.evaluate(() => window.setSession({userId:'user-b',storeId:'store-b',customerRead:true,authorizationFingerprint:'two'}));
  await page.waitForFunction(() => document.querySelector('[data-offline-auth-store]')?.getAttribute('data-offline-auth-store') === 'store-b');
  await page.evaluate(() => window.openScreen('receivable'));
  await page.getByRole('option', {name:'Pelanggan Toko B'}).waitFor({state:'attached'});
  assert.equal(await page.getByRole('option', {name:'Pelanggan Toko A'}).count(), 0, 'customer cache is scoped to the current identity');
  assert.equal(customerGets,2);
  }

  if (scenario === 'all' || scenario === 'pending') {
  await page.evaluate(() => window.setSession({userId:'user-a',storeId:'store-a',authorizationFingerprint:'one'}));
  await page.waitForFunction(() => document.querySelector('[data-offline-auth-store]')?.getAttribute('data-offline-auth-store') === 'store-a');
  await page.evaluate(() => window.openScreen('transfer-create'));
  await page.getByLabel('Nama penerima / supplier').fill('Toko A');
  await page.getByLabel('Keterangan').fill('Tagihan A');
  await page.getByLabel('Nominal').fill('100');
  await page.getByLabel('Kategori laporan').selectOption('ATK');
  holdRegistration = true;
  await page.getByRole('button', {name:'Simpan',exact:true}).click();
  await registrationSeen;
  assert.ok(registrationResolve, 'the attempt registration must be in flight');
  await page.evaluate(() => window.setSession({userId:'user-b',storeId:'store-b',authorizationFingerprint:'two'}));
  await page.waitForFunction(() => document.querySelector('[data-offline-auth-store]')?.getAttribute('data-offline-auth-store') === 'store-b');
  registrationResolve();
  await page.waitForTimeout(200);
  assert.equal(writes,0,'an old registration response must not create an expense under the new session');
  }
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
