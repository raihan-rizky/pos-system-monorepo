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
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {RoleProvider} from './components/providers/RoleProvider';import Page from './app/(main)/keuangan/page';createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><RoleProvider role="OWNER" userId="example-user" userName="Contoh" storeId="example-store" authorizationFingerprint="example-fingerprint"><Page/></RoleProvider></QueryClientProvider>);`, resolveDir: web, loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  alias: { '@': web, '@pos/ui': path.join(repo, 'packages/ui/src/index.ts') }, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'unrelated-page-boundaries', setup(builder) {
    builder.onResolve({ filter: /^(next\/(navigation|link|dynamic))$|\/(SupplierPayablesPanel|DeferredCashFlowChart)$/ }, ({ path: name }) => ({ path: name, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: name }) => ({ resolveDir: web, loader: 'tsx', contents:
      name === 'next/navigation' ? `export const useSearchParams=()=>new URLSearchParams('month=2026-11');export const usePathname=()=>'/keuangan';` :
      name === 'next/link' ? `import React from 'react';export default function Link(props){return <a {...props}/>}` :
      name === 'next/dynamic' ? `export default function dynamic(){return ()=>null}` :
      name.endsWith('SupplierPayablesPanel') ? `export const SupplierPayablesPanel=()=>null;` : `export const DeferredCashFlowChart=()=>null;` }));
  } }],
});
const sources = await Promise.all(['apps/web/app/(main)/keuangan/page.tsx', 'apps/web/features/keuangan/components/ManualFinanceFormModal.tsx', 'apps/web/features/keuangan/components/ManualTransferAllocations.tsx', 'apps/web/features/keuangan/components/ManualIncomePanel.tsx', 'apps/web/features/proof-upload/components/ProofImageUploader.tsx', 'packages/ui/src/Modal.tsx', 'packages/ui/src/Button.tsx'].map(file => readFile(path.join(repo, file), 'utf8')));
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
    const errors = [], writes = [], dialogs = [];
    const incomes = [], expenses = [];
    let failIncome = true;
    let loseTransferResponse = true;
    let loseRegistrationResponse = true;
    const transferAttempts = new Map();
    const pendingAttempts = new Map();
    let loseProofResponse = true;
    const proofAttempts = new Map();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { dialogs.push(dialog.message()); return dialog.accept(); });
    await page.route('http://localhost/**', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      if (!url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'text/html', body: html });
      if (url.pathname.endsWith('/manual-transfer-attempts')) {
        if (method === 'GET') return route.fulfill({ json: { attempts: [...pendingAttempts.values()] } });
        const attempt = request.postDataJSON();
        if (method === 'DELETE') {
          const saved = pendingAttempts.get(attempt.key);
          if (typeof attempt.expectedCompleted !== 'boolean') return route.fulfill({ status: 422, json: { message: 'Status sebelumnya diperlukan.' } });
          if (saved && Boolean(saved.completedAt) !== attempt.expectedCompleted) return route.fulfill({ status: 409, json: { message: 'Status transfer berubah. Periksa kembali sebelum melanjutkan.', attempt: saved } });
          pendingAttempts.delete(attempt.key); return route.fulfill({ json: { success: true } });
        }
        if (pendingAttempts.has(attempt.key)) return route.fulfill({ json: { attempt: pendingAttempts.get(attempt.key) } });
        const expected = (attempt.acknowledgedAttempts ?? []).map(row => `${row.key}:${row.completedAt ?? ''}`).sort();
        const actual = [...pendingAttempts.values()].map(row => `${row.key}:${row.completedAt ?? ''}`).sort();
        if (pendingAttempts.size && (!attempt.forceNew || JSON.stringify(expected) !== JSON.stringify(actual))) return route.fulfill({ status: 409, json: { message: 'Periksa transfer sebelumnya.', attempts: [...pendingAttempts.values()] } });
        const saved = { key: attempt.key, body: attempt.body, createdAt: '2026-11-03T03:00:00Z', completedAt: null };
        pendingAttempts.set(attempt.key, saved);
        if (loseRegistrationResponse) { loseRegistrationResponse = false; return route.fulfill({ status: 503, json: { message: 'Respons persiapan terputus.' } }); }
        return route.fulfill({ status: 201, json: { attempt: saved } });
      }
      let data = {};
      if (method !== 'GET') {
        const payload = method === 'DELETE' && !url.pathname.endsWith('/attachment') ? null : request.postDataJSON();
        writes.push({ method, path: url.pathname, payload, idempotencyKey: request.headers()['idempotency-key'] });
        if (method === 'DELETE' && url.pathname.endsWith('/attachment')) {
          const expense = expenses.find(row => url.pathname.includes(row.id));
          if (proofAttempts.has(payload.requestKey)) return route.fulfill({ json: { data: proofAttempts.get(payload.requestKey) } });
          expense.attachmentUrl = null; expense.updatedAt = '2026-11-03T03:00:01Z';
          const result = { id: expense.id, attachmentUrl: null, updatedAt: expense.updatedAt };
          proofAttempts.set(payload.requestKey, result);
          if (loseProofResponse) { loseProofResponse = false; return route.fulfill({ status: 503, json: { message: 'Respons bukti terputus.' } }); }
          return route.fulfill({ json: { data: result } });
        }
        if (url.pathname.includes('/income') && method === 'POST' && failIncome) { failIncome = false; return route.fulfill({ status: 422, json: { message: 'Contoh gagal simpan. Coba lagi.', errors: { amount: ['Periksa nominal.'] } } }); }
        const list = url.pathname.includes('/income') ? incomes : expenses;
        const transferKey = request.headers()['idempotency-key'];
        if (method === 'POST' && url.pathname.endsWith('/expenses') && transferAttempts.has(transferKey)) {
          return route.fulfill({ json: { data: transferAttempts.get(transferKey) } });
        }
        if (method === 'DELETE') list.splice(list.findIndex(row => row.id === url.pathname.split('/').at(-1)), 1);
        else {
          const id = method === 'POST' ? `example-${list.length + 1}` : url.pathname.split('/').at(-1);
          const row = { ...payload, id, category: payload.category ?? 'SUPPLIES', changeAmount: 0, netAmount: payload.amount, occurredAt: `${payload.occurredAt}T00:00:00+07:00`, createdAt: '2026-11-03T03:00:00Z', updatedAt: '2026-11-03T03:00:00Z', transactionId: null, attachmentUrl: null, hasMissingCostSnapshot: false, source: { type: 'MANUAL_TRANSFER_PURCHASE' }, recordedBy: { id: 'example-user', name: 'Contoh' } };
          if (method === 'POST') list.push(row); else list.splice(list.findIndex(row => row.id === id), 1, row);
          if (method === 'POST' && url.pathname.endsWith('/expenses')) {
            transferAttempts.set(transferKey, row);
          pendingAttempts.get(transferKey).completedAt = '2026-11-03T03:00:00Z';
            if (loseTransferResponse) { loseTransferResponse = false; return route.fulfill({ status: 503, json: { message: 'Respons transfer terputus.' } }); }
          }
          data = { data: row };
        }
      } else if (url.pathname.endsWith('/supplier-payables')) data = { items: [
        { id: 'debt-a', supplierName: 'Pemasok ATK', amount: 5000, paid: 5000, debtDate: '2026-11-01', dueDate: null, reportCategory: 'ATK', payments: [{ id: 'p1', amount: 5000, paidAt: '2026-11-03', origin: 'MANUAL' }] },
        { id: 'debt-b', supplierName: 'Pemasok Spanduk', amount: 16000, paid: 8000, debtDate: '2026-11-01', dueDate: null, reportCategory: 'SPANDUK', payments: [{ id: 'used-elsewhere', amount: 8000, paidAt: '2026-11-03', origin: 'MANUAL', allocated: true }] },
      ], page: 1, total: 2 };
      else if (url.pathname.endsWith('/allocations')) { const item = expenses.find(row => url.pathname.includes(row.id)); data = { allocations: (item?.allocations ?? []).map((entry, index) => ({ ...entry, paymentId: entry.paymentId ?? `created-${index}`, supplierName: entry.payableId === 'debt-a' ? 'Pemasok ATK' : 'Pemasok Spanduk', reportCategory: entry.payableId === 'debt-a' ? 'ATK' : 'SPANDUK', paidAt: '2026-11-03' })) }; }
      else if (url.pathname.endsWith('/cash-flow/summary')) data = { month: '2026-11', income: { total: incomes.reduce((sum, row) => sum + row.amount, 0), daily: [] }, expense: { total: expenses.reduce((sum, row) => sum + row.amount, 0), incomplete: false, daily: [] } };
      else if (url.pathname.endsWith('/income/summary')) data = { month: '2026-11', monthlyTotal: incomes.reduce((sum, row) => sum + row.amount, 0), transactionCount: 0, manualEntryCount: incomes.length, daily: [] };
      else if (url.pathname.endsWith('/expenses/summary')) { const income = incomes.reduce((sum, row) => sum + row.amount, 0), expense = expenses.reduce((sum, row) => sum + row.amount, 0); data = { month: '2026-11', monthlyTotal: expense, entryCount: expenses.length, byCategory: [], daily: [], netCashFlow: { income, expense, net: income - expense } }; }
      else if (url.pathname.endsWith('/expense-categories')) data = { data: [] };
      else { const list = url.pathname.endsWith('/income') ? incomes : expenses; data = { data: list, pagination: { page: 1, total: list.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }; }
      return route.fulfill({ json: data });
    });
    await page.goto('http://localhost/keuangan');
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
    await dialog.getByRole('button', { name: 'Tunai', exact: true }).click();
    assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'form fits viewport');
    await dialog.screenshot({ path: path.join(output, `income-${width}.png`) });
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
    await dialog.getByLabel('Kategori laporan').selectOption('ATK');
    await dialog.getByLabel('Hutang pemasok').selectOption('debt-a');
    await dialog.getByLabel('Pembayaran hutang').selectOption('p1');
    await dialog.getByLabel('Nominal alokasi (Rp)').fill('5000');
    await dialog.getByRole('button', { name: 'Tambah alokasi' }).click();
    await dialog.getByLabel('Hutang pemasok').selectOption('debt-b');
    assert.equal(await dialog.getByLabel('Pembayaran hutang').locator('option[value="used-elsewhere"]').count(), 0, 'payments already allocated elsewhere are unavailable');
    await dialog.getByLabel('Pembayaran hutang').selectOption('new');
    await dialog.getByLabel('Nominal alokasi (Rp)').fill('8000');
    await dialog.getByRole('button', { name: 'Tambah alokasi' }).click();
    await expect(dialog.getByText(/Sisa transfer/)).toContainText('12.000');
    await expect(dialog.getByText('Bukti transfer (opsional)')).toBeVisible();
    assert.equal(await dialog.locator('form').evaluate(element => element.scrollWidth <= element.clientWidth), true, 'transfer form fits viewport');
    for (const name of ['Lepaskan alokasi Pemasok ATK', 'Lepaskan alokasi Pemasok Spanduk']) {
      const bounds = await dialog.getByRole('button', { name }).boundingBox();
      const dialogBounds = await dialog.boundingBox();
      assert.ok(bounds && dialogBounds && bounds.x >= dialogBounds.x && bounds.x + bounds.width <= dialogBounds.x + dialogBounds.width, `${name} fits dialog`);
    }
    await dialog.screenshot({ path: path.join(output, `transfer-${width}.png`) });
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Respons persiapan terputus');
    await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Respons transfer terputus');
    await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
    await page.reload();
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole('button', { name: 'Tambah Belanja Transfer' }).click();
    dialog = page.getByRole('dialog', { name: 'Tambah Belanja Transfer', exact: true });
    await expect(dialog.getByText('Transfer sebelumnya belum dipastikan')).toBeVisible();
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('manual-transfer-attempt:'))), false, 'transfer details are not stored in browser storage');
    await expect(dialog.getByText(/Pemasok contoh/)).toBeVisible();
    await expect(dialog.getByText('Transfer sudah tersimpan.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Selesai' }).click();
    await dialog.waitFor({ state: 'detached' });
    const expenseRow = page.locator('li').filter({ hasText: 'Pemasok contoh' });
    await expect(expenseRow).toContainText('Belanja Transfer Manual');
    expenses[0].attachmentUrl = 'https://prnt.sc/example';
    await page.reload();
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await expenseRow.getByRole('button', { name: 'Aksi', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Ubah', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Ubah Belanja Transfer', exact: true });
    await expect(dialog.getByLabel('Nama penerima / supplier')).toHaveValue('Pemasok contoh');
    await expect(dialog.getByLabel('Kategori laporan')).toHaveValue('ATK');
    await expect(dialog.getByText('Pemasok ATK', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Lepaskan foto' }).click();
    assert.match(dialogs.at(-1), /tetap tersimpan/i, 'the user is told the image file is retained');
    await expect(dialog.getByRole('alert')).toContainText('Respons bukti terputus');
    await dialog.getByRole('button', { name: 'Lepaskan foto' }).click();
    await dialog.getByRole('button', { name: 'Lepaskan alokasi Pemasok ATK' }).click();
    await dialog.getByRole('button', { name: 'Lepaskan alokasi Pemasok Spanduk' }).click();
    await dialog.getByLabel('Kategori laporan').selectOption('SPANDUK');
    await dialog.getByLabel('Nominal (Rp)').fill('30000');
    await dialog.getByRole('button', { name: 'Simpan Perubahan' }).click();
    await dialog.waitFor({ state: 'detached' });
    await expenseRow.getByRole('button', { name: 'Aksi', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Hapus', exact: true }).click();
    await expect(page.getByText('Belum ada pengeluaran bulan ini')).toBeVisible();
    const transfer = writes.find(row => row.method === 'POST' && row.path.endsWith('/expenses'));
    const transferWrites = writes.filter(row => row.method === 'POST' && row.path.endsWith('/expenses'));
    assert.equal(transferWrites.length, 1, 'a confirmed saved transfer is acknowledged without submitting it twice');
    assert.equal(transfer.payload.manualPurchasePaymentMethod, 'TRANSFER');
    assert.match(transfer.idempotencyKey, /^[0-9a-f-]{36}$/i);
    assert.equal(transfer.payload.reportCategory, 'ATK');
    assert.deepEqual(transfer.payload.allocations, [{ payableId: 'debt-a', paymentId: 'p1', amount: 5000 }, { payableId: 'debt-b', paymentId: null, amount: 8000 }]);
    assert.equal(writes.find(row => row.method === 'PATCH' && row.path.endsWith('/expenses/example-1')).payload.reportCategory, 'SPANDUK');
    assert.equal(writes.find(row => row.method === 'DELETE' && row.path.endsWith('/attachment')).payload.expectedUpdatedAt, '2026-11-03T03:00:00Z');
    const proofWrites = writes.filter(row => row.method === 'DELETE' && row.path.endsWith('/attachment'));
    assert.equal(proofWrites[0].payload.requestKey, proofWrites[1].payload.requestKey, 'proof deletion retry keeps its request key');
    assert.equal(writes.find(row => row.method === 'PATCH' && row.path.endsWith('/expenses/example-1')).payload.updatedAt, '2026-11-03T03:00:01Z');
    assert.equal(transfer.payload.transactionId, undefined);
    assert.equal(writes.some(row => /stock|inventory|transactions/.test(row.path)), false);
    if (width === 1280) {
      loseTransferResponse = true;
      const fillIdenticalTransfer = async current => {
        await current.getByLabel('Nama penerima / supplier').fill('Pemasok sama');
        await current.getByLabel('Keterangan belanja').fill('Pembayaran terpisah');
        await current.getByLabel('Nominal (Rp)').fill('100');
        await current.getByLabel('Kategori laporan').selectOption('ATK');
      };
      await page.getByRole('button', { name: 'Tambah Belanja Transfer' }).click();
      dialog = page.getByRole('dialog', { name: 'Tambah Belanja Transfer', exact: true });
      await fillIdenticalTransfer(dialog);
      await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('Respons transfer terputus');
      await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
      await page.getByRole('button', { name: 'Tambah Belanja Transfer' }).click();
      dialog = page.getByRole('dialog', { name: 'Tambah Belanja Transfer', exact: true });
      await dialog.getByRole('button', { name: 'Catat transfer baru' }).click();
      await expect(dialog.getByText('Transfer sudah tersimpan.')).toBeVisible();
      await dialog.getByRole('button', { name: 'Selesai' }).click();
      await expect(dialog.getByLabel('Nama penerima / supplier')).toBeVisible();
      await fillIdenticalTransfer(dialog);
      await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      const identicalWrites = writes.filter(row => row.method === 'POST' && row.payload?.applicantName === 'Pemasok sama');
      assert.equal(identicalWrites.length, 2);
      assert.notEqual(identicalWrites[0].idempotencyKey, identicalWrites[1].idempotencyKey, 'a separate identical transfer has its own key');
      assert.equal(expenses.length, 2, 'recovering the first transfer keeps both distinct transfers');

      const staleKey = '3d82db0d-647a-4e65-9bd1-ec8a66bb2c02';
      pendingAttempts.set(staleKey, { key: staleKey, body: JSON.stringify({ applicantName: 'Pemasok tertunda', amount: 100, occurredAt: '2026-11-03' }), createdAt: '2026-11-03T03:00:00Z', completedAt: null });
      await page.getByRole('button', { name: 'Tambah Belanja Transfer' }).click();
      dialog = page.getByRole('dialog', { name: 'Tambah Belanja Transfer', exact: true });
      await expect(dialog.getByRole('button', { name: 'Lupakan' })).toBeVisible();
      pendingAttempts.get(staleKey).completedAt = '2026-11-03T03:01:00Z';
      await dialog.getByRole('button', { name: 'Lupakan' }).click();
      await expect(dialog.getByRole('alert')).toContainText('Status transfer berubah');
      await expect(dialog.getByText('Transfer sudah tersimpan.')).toBeVisible();
      assert.equal(pendingAttempts.has(staleKey), true, 'changed status is not discarded');
      await dialog.getByRole('button', { name: 'Selesai' }).click();
      await dialog.waitFor({ state: 'detached' });

      pendingAttempts.set(staleKey, { key: staleKey, body: JSON.stringify({ applicantName: 'Pemasok tertunda', amount: 100, occurredAt: '2026-11-03' }), createdAt: '2026-11-03T03:00:00Z', completedAt: null });
      await page.getByRole('button', { name: 'Tambah Belanja Transfer' }).click();
      dialog = page.getByRole('dialog', { name: 'Tambah Belanja Transfer', exact: true });
      await dialog.getByRole('button', { name: 'Catat transfer baru' }).click();
      await fillIdenticalTransfer(dialog);
      pendingAttempts.get(staleKey).completedAt = '2026-11-03T03:02:00Z';
      await dialog.getByRole('button', { name: 'Simpan', exact: true }).click();
      await expect(dialog.getByText('Transfer sudah tersimpan.')).toBeVisible();
      assert.equal(pendingAttempts.size, 1, 'a new transfer is not registered using a stale acknowledgement');
      await dialog.getByRole('button', { name: 'Selesai' }).click();
      await expect(dialog.getByLabel('Nama penerima / supplier')).toHaveValue('Pemasok sama');
      await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('PASS: create, retry, double-submit protection, edit/delete income and transfer; keyboard and 320/390/1280px layouts; no stock or transaction writes.');
} finally { await browser.close(); }
