import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
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
  "next/dynamic": `import React from 'react'; export default loader => { const Component = React.lazy(() => loader().then(value => ({ default: value.default ?? value }))); return props => <React.Suspense fallback={null}><Component {...props} /></React.Suspense>; };`,
  "@/components/providers/RoleProvider": `export const useRole = () => ({ role: 'OWNER', userId: 'user', storeId: 'store', authorizationFingerprint: 'example', canPerform: (resource, action) => resource === 'printing_receipt.processed' && action === 'update' });`,
  "@/hooks/useProducts": "export const useCategories = () => ({ data: [] }); export const useProductsPage = () => ({ data: { data: [], pagination: { totalPages: 1 } }, isLoading: false });",
  "@/hooks/useTransactions": `export const useTransactionHistory = () => ({ data: { data: window.exampleTransactions, pagination: { total: 1, totalPages: 1 } }, isLoading: false });
    export const useTransaction = id => { window.selectedTransaction = id; return { data: null }; };
    export const useUpdateTransaction = () => ({}); export const useUpdateTransactionInvoiceDate = () => ({});
    export const useDeleteTransaction = () => ({}); export const useRejectTransaction = () => ({});`,
  "@/features/surat-jalan/components/SuratJalanBundleButton": "export const SuratJalanBundleButton = () => null; export const isTransactionEligibleForSuratJalan = () => true;",
  "@/features/surat-jalan/components/SuratJalanCreateModal": "export const SuratJalanCreateModal = () => null;",
  "@/components/ReceiptModal": "export const ReceiptModal = () => null;",
  "@/components/PaymentModal": "export const PaymentModal = () => null;",
  "./components/TransactionCartEditor": "export const TransactionCartEditor = () => null;",
  "./components/ApproveModal": "export const ApproveModal = () => null;",
  "@/features/printing-receipts/components/PrintingReceiptApprovalModal": "export const PrintingReceiptApprovalModal = () => null;",
  "@/features/transactions-draft/components/ApproveDraftDialog": "export const ApproveDraftDialog = () => null;",
  "./components/TransactionNoteModal": "export const TransactionNoteModal = () => null;",
  "@/features/transaction-history/components/TransactionBuktiModal": "export default () => null;",
};

const bundle = await esbuild.build({
  stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
    import HistoryClientPage from './app/(main)/history/HistoryClientPage';
    window.exampleTransactions = [{ id:'tx-example', invoiceNumber:'INV-CONTOH', draftNumber:null,
      subtotal:81000, discount:0, tax:0, total:81000, paymentMethod:'CASH', amountPaid:81000,
      change:0, cashierId:'cashier', customerName:'Pelanggan Contoh', salesName:null, salespersonId:null,
      note:null, status:'COMPLETED', createdAt:'2026-10-29T03:00:00Z', items:[],
      printingReceipt:{ id:'receipt-example', number:'NT-CONTOH', subcategory:'SPANDUK' } }];
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><HistoryClientPage /></QueryClientProvider>);`,
    resolveDir: web, loader: "tsx" },
  bundle: true, write: false, jsx: "automatic", outdir: "bundle", platform: "browser", format: "iife",
  tsconfig: path.join(web, "tsconfig.json"),
  plugins: [{ name: "fixtures", setup(build) {
    build.onResolve({ filter: /.*/ }, args => fixtures[args.path] ? { path: args.path, namespace: "fixture" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtures[args.path], loader: "tsx", resolveDir: web }));
  } }],
});

const componentDir = path.join(web, "features/printing-receipts/components");
const componentSource = (await Promise.all((await readdir(componentDir)).filter(name => name.endsWith(".tsx")).map(name => readFile(path.join(componentDir, name), "utf8")))).join("\n");
const pageSource = await readFile(path.join(web, "app/(main)/history/HistoryClientPage.tsx"), "utf8");
const css = await postcss([tailwind({ ...loadConfig(path.join(web, "tailwind.config.ts")), content: [
  { raw: pageSource + componentSource, extension: "tsx" }, path.join(root, "packages/ui/src/**/*.{ts,tsx}"),
] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined });
const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}${css.css}</style></head><body><div id="root"></div><script>${bundle.outputFiles.find(file => file.path.endsWith(".js")).text}</script></body></html>`;
const receipt = {
  id: "receipt-example", storeId: "store", subcategory: "SPANDUK", number: "NT-CONTOH", revision: 1,
  transactionId: "tx-example", createdAt: "2026-10-29T03:00:00Z", updatedAt: "2026-10-29T03:00:00Z",
  transaction: { id: "tx-example", subtotal: 81000, discount: 0, tax: 0, total: 81000, amountPaid: 81000, change: 0, status: "COMPLETED" },
  document: { title: "Nota contoh", customerName: "Pelanggan Contoh", customerPhone: "", customerId: null,
    date: "2026-10-29", note: "", completionDate: "", completionTime: "", receiver: "", setter: "", signatory: "",
    lines: [{ id: "line-example", name: "Spanduk contoh", material: "Flexi", quantity: 1, price: 81000, stockLink: null }] },
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [1280, 390]) {
    for (const stale of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      let receiptRequests = 0;
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
        if (url.pathname === "/api/salespersons") return route.fulfill({ contentType: "application/json", body: '{"data":[]}' });
        if (url.pathname === "/api/printing-receipts/receipt-example") {
          receiptRequests += 1;
          const current = structuredClone(receipt);
          if (stale && receiptRequests > 1) current.transaction.status = "VOIDED";
          return route.fulfill({ contentType: "application/json", body: JSON.stringify(current) });
        }
        return route.fulfill({ status: 404, body: "" });
      });
      await page.goto("http://history-printing.test");
      const entry = width >= 768 ? page.locator("tbody tr").first() : page.locator('div[role="button"]').filter({ hasText: "INV-CONTOH" }).first();
      const view = entry.getByRole("button", { name: "Lihat Struk", exact: true });
      const edit = entry.getByRole("button", { name: "Edit nota diproses", exact: true });
      await edit.waitFor();
      assert.equal(await view.evaluate(button => button.nextElementSibling?.textContent), "Edit nota diproses");
      await edit.click();
      if (stale) {
        await page.getByRole("alert").getByText("Nota ini tidak lagi dapat diedit", { exact: false }).waitFor();
        assert.equal(await page.getByRole("dialog", { name: "Edit nota diproses" }).count(), 0);
      } else {
        const editor = page.getByRole("dialog", { name: "Edit nota diproses" });
        await editor.getByText("PERINGATAN: Anda mengubah nota yang sudah diproses").waitFor();
        await editor.getByRole("button", { name: "Tutup edit nota" }).click();
        await edit.waitFor();
        await page.waitForFunction(() => document.activeElement?.textContent === "Edit nota diproses");
      }
      assert.equal(await page.evaluate(() => window.selectedTransaction), null);
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  process.stdout.write("Processed printing edit: desktop, mobile, and stale status passed.\n");
} finally {
  await browser.close();
}
