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
  "next/dynamic": "export default () => () => null;",
  "@/components/providers/RoleProvider": "export const useRole = () => ({ role: 'OWNER', canPerform: (resource, action) => resource === 'transaction' && action === 'update' });",
  "@/hooks/useProducts": "export const useCategories = () => ({ data: [] });",
  "@/hooks/useTransactions": `export const useTransactionHistory = () => ({ data: { data: window.exampleTransactions, pagination: { total: 1, totalPages: 1 } }, isLoading: false });
    export const useTransaction = (id) => { window.selectedTransaction = id; return { data: null }; };
    export const useUpdateTransaction = () => ({ mutateAsync: async () => ({}) });
    export const useUpdateTransactionInvoiceDate = () => ({ mutateAsync: async () => ({}) });
    export const useDeleteTransaction = () => ({ mutateAsync: async () => ({}) });
    export const useRejectTransaction = () => ({ mutateAsync: async () => ({}) });`,
  "@/features/surat-jalan/components/SuratJalanBundleButton": "export const SuratJalanBundleButton = () => null; export const isTransactionEligibleForSuratJalan = () => true;",
  "@/features/surat-jalan/components/SuratJalanCreateModal": "export const SuratJalanCreateModal = () => null;",
  "@/components/ReceiptModal": "export const ReceiptModal = () => null;",
  "./components/TransactionCartEditor": "export const TransactionCartEditor = () => null;",
  "./components/ApproveModal": "export const ApproveModal = () => null;",
  "@/features/printing-receipts/components/PrintingReceiptApprovalModal": "export const PrintingReceiptApprovalModal = () => null;",
  "@/features/transactions-draft/components/ApproveDraftDialog": "export const ApproveDraftDialog = () => null;",
  "./components/TransactionNoteModal": "export const TransactionNoteModal = () => null;",
  "@/features/transaction-history/components/TransactionBuktiModal": "export default () => null;",
};

const bundle = await esbuild.build({
  stdin: {
    contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
      import HistoryClientPage from './app/(main)/history/HistoryClientPage';
      window.exampleTransactions = [{ id:'tx-example', invoiceNumber:'INV-CONTOH', draftNumber:null,
        subtotal:81000, discount:0, tax:0, total:81000, paymentMethod:'CASH', amountPaid:81000,
        change:0, cashierId:'cashier', customerName:'Pelanggan Contoh', salesName:null,
        salespersonId:null, note:null, status:'COMPLETED', createdAt:'2026-10-29T03:00:00Z', items:[] }];
      createRoot(document.getElementById('root')).render(<HistoryClientPage />);`,
    resolveDir: web,
    loader: "tsx",
  },
  bundle: true, write: false, jsx: "automatic", outdir: "bundle", platform: "browser", format: "iife",
  tsconfig: path.join(web, "tsconfig.json"),
  plugins: [{ name: "fixtures", setup(build) {
    build.onResolve({ filter: /.*/ }, args => fixtures[args.path] ? { path: args.path, namespace: "fixture" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtures[args.path], loader: "tsx", resolveDir: web }));
  } }],
});

const source = await readFile(path.join(web, "app/(main)/history/HistoryClientPage.tsx"), "utf8");
const menuSource = await readFile(path.join(web, "app/(main)/history/TransactionActionMenu.tsx"), "utf8");
const config = loadConfig(path.join(web, "tailwind.config.ts"));
const css = await postcss([tailwind({ ...config, content: [
  { raw: source + menuSource, extension: "tsx" }, path.join(root, "packages/ui/src/**/*.{ts,tsx}"),
] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined });
const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>html,body{margin:0}${css.css}</style></head><body><div id="root"></div><script>${bundle.outputFiles.find(file => file.path.endsWith(".js")).text}</script></body></html>`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
      if (url.pathname === "/api/salespersons") return route.fulfill({ contentType: "application/json", body: '{"data":[]}' });
      return route.fulfill({ status: 404, body: "" });
    });
    await page.goto("http://history-edit.test");
    const entry = width >= 768 ? page.locator("tbody tr").first() : page.locator('div[role="button"]').filter({ hasText: "INV-CONTOH" }).first();
    const view = entry.getByRole("button", { name: "Lihat Struk", exact: true });
    const edit = entry.getByRole("button", { name: "Ubah", exact: true });
    await edit.waitFor();
    assert.equal(await view.evaluate(button => button.nextElementSibling?.textContent), "Ubah");
    const viewBox = await view.boundingBox();
    const editBox = await edit.boundingBox();
    assert.ok(viewBox && editBox && Math.abs(viewBox.y - editBox.y) < 1, "Ubah harus sejajar dengan Lihat Struk");
    await entry.getByRole("button", { name: "Pilihan aksi" }).click();
    const menu = page.locator("[data-placement]");
    await menu.getByRole("button", { name: "Upload Bukti Transaksi" }).waitFor();
    assert.equal(await menu.getByRole("button", { name: "Ubah", exact: true }).count(), 0);
    await entry.getByRole("button", { name: "Pilihan aksi" }).click();
    await edit.click();
    await page.getByRole("heading", { name: "Ubah Transaksi", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.selectedTransaction), null, "editing must not also open the receipt");
    assert.deepEqual(errors, []);
    await page.close();
  }
  process.stdout.write("Regular invoice edit action: desktop and mobile passed.\n");
} finally {
  await browser.close();
}
