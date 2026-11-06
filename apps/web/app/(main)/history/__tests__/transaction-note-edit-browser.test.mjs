import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const web = path.join(root, "apps/web");
const require = createRequire(path.join(web, "package.json"));
const esbuild = require(require.resolve("esbuild", { paths: [path.join(root, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const loadConfig = require("tailwindcss/loadConfig");

const fixtures = {
  "next/dynamic": `import React from 'react';
    export default (load) => {
      const Lazy = React.lazy(() => load().then(value => ({ default: value.default || value })));
      return props => <React.Suspense fallback={null}><Lazy {...props} /></React.Suspense>;
    };`,
  "@/components/providers/RoleProvider": "export const useRole = () => ({ role: 'OWNER', canPerform: (resource, action) => resource === 'transaction' && action === 'update' });",
  "@/hooks/useProducts": "export const useCategories = () => ({ data: [] });",
  "@/hooks/useTransactions": `export const useTransactionHistory = () => ({ data: { data: window.exampleTransactions, pagination: { total: 1, totalPages: 1 } }, isLoading: false });
    export const useTransaction = () => ({ data: null });
    export const useUpdateTransaction = () => ({ isPending: false, mutateAsync: async (input) => {
      window.savedDetails.push(input); if (window.failDetails) throw new Error('Konflik contoh'); return {};
    } });
    export const useUpdateTransactionInvoiceDate = () => ({ mutateAsync: async () => ({}) });
    export const useDeleteTransaction = () => ({ mutateAsync: async () => ({}) });
    export const useRejectTransaction = () => ({ mutateAsync: async () => ({}) });`,
  "@/features/surat-jalan/components/SuratJalanBundleButton": "export const SuratJalanBundleButton = () => null; export const isTransactionEligibleForSuratJalan = () => true;",
  "@/features/surat-jalan/components/SuratJalanCreateModal": "export const SuratJalanCreateModal = () => null;",
  "@/components/ReceiptModal": "export const ReceiptModal = () => null;",
  "./components/TransactionCartEditor": `import React from 'react';
    export function TransactionCartEditor({ items, onChange }) { return <section aria-label="Produk">
      <p data-testid="cart-total">Total Produk</p>
      <button type="button" onClick={() => onChange(items.map(item => ({ ...item, quantity: 2 })))}>Ubah jumlah</button>
      <button type="button" onClick={() => onChange(items.map(item => ({ ...item, quantity: 1 })))}>Kembalikan jumlah</button>
    </section> }`,
  "./components/ApproveModal": "export const ApproveModal = () => null;",
  "@/features/printing-receipts/components/PrintingReceiptApprovalModal": "export const PrintingReceiptApprovalModal = () => null;",
  "@/features/printing-receipts/components/PrintingReceiptTransactionModal": "export const PrintingReceiptTransactionModal = () => null;",
  "@/features/transactions-draft/components/ApproveDraftDialog": "export const ApproveDraftDialog = () => null;",
  "./components/TransactionNoteModal": "export const TransactionNoteModal = () => null;",
  "@/features/transaction-history/components/TransactionBuktiModal": "export default () => null;",
};

const bundle = await esbuild.build({
  stdin: {
    contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
      import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      import HistoryClientPage from './app/(main)/history/HistoryClientPage';
      window.savedDetails = []; window.failDetails = false;
      window.exampleTransactions = [{ id:'tx-example', invoiceNumber:'INV-CONTOH', draftNumber:null,
        subtotal:81000, discount:0, tax:0, total:81000, paymentMethod:'CASH', amountPaid:81000,
        change:0, cashierId:'cashier', customerName:'Pelanggan Contoh', salesName:null,
        salespersonId:null, note:'Catatan lama | Pelunasan piutang 500.000 (CASH) [DIVISI:Produksi]',
        status:'COMPLETED', createdAt:'2026-10-29T03:00:00Z',
        items:[{ id:'item-1', productId:'product-1', productName:'Kertas', quantity:1, unitPrice:81000, subtotal:81000, discount:0 }] }];
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><HistoryClientPage /></QueryClientProvider>);`,
    resolveDir: web,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  jsx: "automatic",
  outdir: "bundle",
  platform: "browser",
  format: "iife",
  tsconfig: path.join(web, "tsconfig.json"),
  plugins: [{ name: "fixtures", setup(build) {
    build.onResolve({ filter: /.*/ }, args => fixtures[args.path] ? { path: args.path, namespace: "fixture" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtures[args.path], loader: "tsx", resolveDir: web }));
  } }],
});

const script = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
const source = await readFile(path.join(web, "app/(main)/history/HistoryClientPage.tsx"), "utf8");
const menuSource = await readFile(path.join(web, "app/(main)/history/TransactionActionMenu.tsx"), "utf8");
const config = loadConfig(path.join(web, "tailwind.config.ts"));
const css = await postcss([tailwind({ ...config, content: [
  { raw: source + menuSource, extension: "tsx" }, path.join(root, "packages/ui/src/**/*.{ts,tsx}"),
] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined });
const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>html,body{margin:0}${css.css}</style></head><body><div id="root"></div><script>globalThis.process = { env: { NODE_ENV: "test" } };</script><script>${script}</script></body></html>`;
const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const itemRequests = [];
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
      if (url.pathname === "/api/salespersons") return route.fulfill({ contentType: "application/json", body: '{"data":[]}' });
      if (url.pathname === "/api/transactions/tx-example/items") {
        itemRequests.push(route.request().postDataJSON());
        return route.fulfill({ contentType: "application/json", body: "{}" });
      }
      return route.fulfill({ status: 404, body: "" });
    });
    await page.goto("http://transaction-note.test");
    await page.waitForTimeout(1000);
    if (await page.getByRole("button", { name: "Ubah", exact: true }).count() === 0) {
      throw new Error(`Fixture halaman gagal: ${JSON.stringify(pageErrors)}; ${await page.locator("body").innerText()}`);
    }
    const entry = width >= 768 ? page.locator("tbody tr").first() : page.locator('div[role="button"]').filter({ hasText: "INV-CONTOH" }).first();
    const open = async () => {
      await entry.getByRole("button", { name: "Ubah", exact: true }).click();
      const heading = page.getByRole("heading", { name: "Ubah Transaksi", exact: true });
      await heading.waitFor();
      return heading.locator("..").locator("..").locator("..");
    };
    let panel = await open();
    let note = panel.getByRole("textbox", { name: "Catatan Transaksi" });
    await note.waitFor({ timeout: 5000 });
    await panel.getByTestId("cart-total").waitFor();
    assert.equal(await note.inputValue(), "Catatan lama");
    assert.equal(await note.evaluate(element => Boolean(document.querySelector('[data-testid="cart-total"]')?.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
    await note.scrollIntoViewIfNeeded();
    const noteBox = await note.boundingBox();
    assert.ok(noteBox && noteBox.x >= 0 && noteBox.x + noteBox.width <= width + 1, "kolom catatan harus muat di layar");
    if (width === 1280 && process.env.TRANSACTION_NOTE_SCREENSHOT) {
      await note.fill("Kirim sebelum pukul 10.00");
      await note.locator("..").screenshot({ path: process.env.TRANSACTION_NOTE_SCREENSHOT });
    }
    await note.fill("Belum disimpan");
    await panel.getByRole("button", { name: "Batal", exact: true }).click();
    panel = await open();
    note = panel.getByRole("textbox", { name: "Catatan Transaksi" });
    assert.equal(await note.inputValue(), "Catatan lama");
    await page.evaluate(() => { window.exampleTransactions[0].note = "Catatan dari sesi lain"; });
    await note.fill("Kirim pagi\nHubungi dulu");
    await panel.getByRole("button", { name: "Simpan", exact: true }).click();
    await page.waitForFunction(() => window.savedDetails.length === 1);
    let details = await page.evaluate(() => window.savedDetails[0]);
    assert.equal(details.note, "Kirim pagi\nHubungi dulu");
    assert.equal(details.expectedNote, "Catatan lama | Pelunasan piutang 500.000 (CASH) [DIVISI:Produksi]");
    assert.equal(itemRequests.length, 0, "catatan saja tidak boleh menyimpan ulang produk");
    await page.evaluate(() => { window.exampleTransactions[0].note = "Catatan lama | Pelunasan piutang 500.000 (CASH) [DIVISI:Produksi]"; });

    panel = await open();
    await panel.getByRole("textbox", { name: "Catatan Transaksi" }).fill("");
    await panel.getByRole("button", { name: "Simpan", exact: true }).click();
    await page.waitForFunction(() => window.savedDetails.length === 2);
    details = await page.evaluate(() => window.savedDetails[1]);
    assert.equal(details.note, "");
    assert.equal(itemRequests.length, 0);

    panel = await open();
    await panel.getByRole("button", { name: "Ubah jumlah" }).click();
    await panel.getByRole("button", { name: "Kembalikan jumlah" }).click();
    await panel.getByRole("button", { name: "Simpan", exact: true }).click();
    await page.waitForFunction(() => window.savedDetails.length === 3);
    assert.equal(itemRequests.length, 0, "produk yang dikembalikan ke nilai awal tidak boleh diproses ulang");
    details = await page.evaluate(() => window.savedDetails[2]);
    assert.equal(Object.hasOwn(details, "note"), false, "catatan yang tidak berubah tidak dikirim");

    await page.evaluate(() => { window.failDetails = true; });
    panel = await open();
    await panel.getByRole("textbox", { name: "Catatan Transaksi" }).fill("Konflik catatan");
    await panel.getByRole("button", { name: "Simpan", exact: true }).click();
    await panel.getByText("Konflik contoh", { exact: true }).waitFor();
    assert.equal(itemRequests.length, 0);
    await panel.getByRole("button", { name: "Batal", exact: true }).click();

    panel = await open();
    await panel.getByRole("button", { name: "Ubah jumlah" }).click();
    await panel.getByRole("textbox", { name: "Catatan Transaksi" }).fill("Catatan baru");
    await panel.getByRole("button", { name: "Simpan", exact: true }).click();
    await panel.getByText(/Produk sudah disimpan, tetapi rincian transaksi belum tersimpan/).waitFor();
    assert.equal(itemRequests.length, 1);
    assert.deepEqual(pageErrors, []);
    await page.close();
  }
  process.stdout.write("Transaction note editor: desktop and mobile passed.\n");
} finally {
  await browser.close();
}
