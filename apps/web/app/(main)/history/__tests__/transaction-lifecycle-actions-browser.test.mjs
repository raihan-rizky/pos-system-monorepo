import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const web = path.join(root, "apps/web");
const require = createRequire(path.join(web, "package.json"));
const esbuild = require(require.resolve("esbuild", { paths: [path.join(root, "node_modules/.pnpm/node_modules")] }));
const { chromium, expect } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const loadConfig = require("tailwindcss/loadConfig");

const fixtures = {
  "next/dynamic": "export default () => () => null;",
  "next/link": "export default function Link({children,...props}) { return <a {...props}>{children}</a>; }",
  "@/components/providers/RoleProvider": "export const useRole = () => ({ role: window.exampleRole, canPerform: (resource, action) => resource === 'transaction' && window.exampleGrants[action] === true });",
  "@/hooks/useProducts": "export const useCategories = () => ({ data: [] });",
  "@/hooks/useTransactions": `import {useState} from 'react';
    export const useTransactionHistory = () => ({ data: { data: window.exampleTransactions, pagination: { total: window.exampleTransactions.length, totalPages: 1 } }, isLoading: false });
    export const useTransaction = () => ({ data: null });
    export const useUpdateTransaction = () => ({ isPending: false, mutateAsync: async payload => {
      window.updatedTransactions.push(payload); window.exampleTransactions.find(tx => tx.id === payload.id).status = payload.status; return {}; } });
    export const useUpdateTransactionInvoiceDate = () => ({ mutateAsync: async () => ({}) });
    export const useDeleteTransaction = () => {
      const [isPending, setPending] = useState(false);
      return { isPending, mutateAsync: async id => {
        setPending(true);
        try {
          if (window.pauseDelete) await new Promise(resolve => { window.releaseDelete = resolve; });
          if (window.deleteError) throw new Error(window.deleteError);
          window.deletedIds.push(id); window.exampleTransactions = window.exampleTransactions.filter(tx => tx.id !== id);
          return { warnings: window.exampleWarnings };
        } finally { setPending(false); }
      }};
    };
    export const useRejectTransaction = () => ({ mutateAsync: async () => ({}) });`,
  "@/features/surat-jalan/components/SuratJalanBundleButton": "export const SuratJalanBundleButton = () => null; export const isTransactionEligibleForSuratJalan = () => true;",
  "@/features/surat-jalan/components/SuratJalanCreateModal": "export const SuratJalanCreateModal = () => null;",
  "@/components/ReceiptModal": "export const ReceiptModal = () => null;",
  "./components/TransactionCartEditor": "export const TransactionCartEditor = () => null;",
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
      window.exampleTransactions = [...window.exampleFillers, window.exampleTransaction];
      window.updatedTransactions = []; window.deletedIds = [];
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><HistoryClientPage /></QueryClientProvider>);`,
    resolveDir: web, loader: "tsx",
  },
  bundle: true, write: false, jsx: "automatic", outdir: "bundle", platform: "browser", format: "iife",
  tsconfig: path.join(web, "tsconfig.json"),
  plugins: [{ name: "fixtures", setup(build) {
    build.onResolve({ filter: /.*/ }, args => fixtures[args.path] ? { path: args.path, namespace: "fixture" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtures[args.path], loader: "tsx", resolveDir: web }));
  } }],
});

const source = await Promise.all(["HistoryClientPage.tsx", "TransactionActionMenu.tsx"].map(file =>
  readFile(path.join(web, "app/(main)/history", file), "utf8")));
const config = loadConfig(path.join(web, "tailwind.config.ts"));
const css = await postcss([tailwind({ ...config, content: [
  { raw: source.join("\n"), extension: "tsx" }, path.join(root, "packages/ui/src/**/*.{ts,tsx}"),
] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined });
const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}#root{height:100%;display:flex;flex-direction:column}${css.css}</style></head><body><div id="root"></div><script>${bundle.outputFiles.find(file => file.path.endsWith(".js")).text}</script></body></html>`;

const baseTransaction = {
  id: "tx-example", invoiceNumber: "INV-CONTOH", draftNumber: null,
  subtotal: 81000, discount: 0, tax: 0, total: 81000, paymentMethod: "CASH", amountPaid: 81000,
  change: 0, cashierId: "cashier", customerName: "Pelanggan Contoh", salesName: null,
  salespersonId: null, note: null, status: "COMPLETED", createdAt: "2026-11-05T03:00:00Z", items: [],
};
const cases = [
  { name: "ATK", fields: {} },
  { name: "nota percetakan", fields: { printingReceipt: { id: "printing-example", number: "NT-CONTOH", subcategory: "SPANDUK" } } },
  { name: "subkategori percetakan", fields: { printingSubcategory: "SPANDUK" } },
  { name: "surat jalan", fields: { suratJalanSummary: { count: 2, confirmedCount: 1, pendingCount: 1, deliveredQuantity: 1, totalQuantity: 2 } } },
  { name: "nota penawaran", fields: { invoiceNumber: null, draftNumber: "DRF-CONTOH", status: "DRAFT" } },
  { name: "menunggu persetujuan", fields: { status: "PENDING_APPROVAL" } },
];
const warning = { code: "QUOTATION_STOCK_REVIEW_REQUIRED", message: "Bukti stok nota penawaran tidak lengkap. Periksa riwayat stok secara manual." };

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const role of ["OWNER", "ADMIN", "CASHIER", "SALES"]) {
    for (const width of [1280, 390]) {
      for (const grants of [{ update: false, delete: false }, { update: true, delete: false }, { update: false, delete: true }, { update: true, delete: true }]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        page.setDefaultTimeout(5000);
        page.setDefaultNavigationTimeout(30000);
        await page.addInitScript(({ role, grants, tx }) => {
          window.exampleRole = role; window.exampleGrants = grants; window.exampleTransaction = tx;
          window.exampleFillers = []; window.exampleWarnings = [];
        }, { role, grants, tx: { ...baseTransaction, suratJalanSummary: { count: 2, confirmedCount: 1, pendingCount: 1, deliveredQuantity: 1, totalQuantity: 2 } } });
        await page.route("**/*", route => {
          const url = new URL(route.request().url());
          if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
          if (url.pathname === "/api/salespersons") return route.fulfill({ contentType: "application/json", body: '{"data":[]}' });
          return route.fulfill({ status: 404, body: "" });
        });
        await page.goto("http://history-lifecycle.test");
        const entry = width >= 768 ? page.locator("tbody tr").first() : page.locator('div[role="button"]').filter({ hasText: "INV-CONTOH" }).first();
        await expect(entry).toBeVisible();
        const trigger = entry.getByRole("button", { name: "Pilihan aksi" });
        if (grants.update || grants.delete) {
          await trigger.click();
          const menu = page.locator("[data-placement]");
          assert.equal(await menu.getByRole("button", { name: "Void", exact: true }).count(), grants.update ? 1 : 0, `${role}/${width}: Void mengikuti grant update`);
          assert.equal(await menu.getByRole("button", { name: "Hapus", exact: true }).count(), grants.delete ? 1 : 0, `${role}/${width}: Hapus mengikuti grant delete`);
        } else {
          await expect(trigger).toHaveCount(0);
        }
        await page.close();
      }
    }
  }
  process.stdout.write("RBAC matrix: 32 desktop/mobile role and grant cases passed.\n");
  for (const width of [1280, 390]) {
    for (const example of cases) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(5000);
      page.setDefaultNavigationTimeout(30000);
      const errors = [];
      page.on("pageerror", error => { errors.push(error.message); process.stderr.write(`${error.stack}\n`); });
      const tx = { ...baseTransaction, ...example.fields };
      const documentNumber = tx.invoiceNumber ?? tx.draftNumber;
      const fillers = tx.draftNumber ? Array.from({ length: 24 }, (_, index) => ({
        ...baseTransaction, id: `tx-filler-${index}`, invoiceNumber: `INV-CONTOH-${index}`,
      })) : [];
      await page.addInitScript(({ tx, warnings, fillers }) => {
        window.exampleTransaction = tx; window.exampleWarnings = warnings; window.exampleFillers = fillers;
        window.exampleRole = "OWNER"; window.exampleGrants = { update: true, delete: true };
      }, { tx, warnings: tx.draftNumber ? [warning] : [], fillers });
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
        if (url.pathname === "/api/salespersons") return route.fulfill({ contentType: "application/json", body: '{"data":[]}' });
        return route.fulfill({ status: 404, body: "" });
      });
      await page.goto("http://history-lifecycle.test");
      const entry = width >= 768 ? page.locator("tbody tr").filter({ hasText: documentNumber }).first() : page.locator('div[role="button"]').filter({ hasText: documentNumber }).first();
      const trigger = entry.getByRole("button", { name: "Pilihan aksi" });
      const menu = page.locator("[data-placement]");
      await trigger.click();
      const triggerBox = await trigger.boundingBox();
      assert.ok(triggerBox && triggerBox.width >= 44 && triggerBox.height >= 44, "Target sentuh pilihan aksi minimal 44px");
      for (const name of ["Hapus", "Void"]) {
        const actionBox = await menu.getByRole("button", { name, exact: true }).boundingBox();
        assert.ok(actionBox && actionBox.height >= 44, `${name}: target sentuh minimal 44px`);
      }
      if (width === 1280 && example.name === "surat jalan") {
        await menu.screenshot({ path: path.join(web, "public/images/changelog/hapus-void-transaksi-surat-jalan.png") });
      }
      await menu.getByRole("button", { name: "Void", exact: true }).click();
      await page.getByRole("heading", { name: "Batalkan Transaksi?" }).waitFor();
      let dialog = page.getByRole("dialog", { name: "Batalkan Transaksi?" });
      await expect(dialog).toBeVisible();
      assert.equal(await dialog.evaluate(el => el instanceof HTMLDialogElement && el.matches(":modal")), true);
      await expect(dialog.getByRole("button", { name: "Batal", exact: true })).toBeFocused();
      await expect(dialog).toContainText(documentNumber);
      if (tx.suratJalanSummary) await expect(dialog).toContainText(/seluruh surat jalan.*PENDING.*CONFIRMED.*dibatalkan/i);
      if (tx.draftNumber) await expect(dialog).toContainText(/tanpa bukti mutasi/i);
      const box = await dialog.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width && box.height <= 900);
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("button", { name: "Ya, Batalkan" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();

      await trigger.click();
      await menu.getByRole("button", { name: "Void", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Batalkan Transaksi?" });
      await dialog.getByRole("button", { name: "Ya, Batalkan" }).click();
      await expect(dialog).toHaveCount(0);
      assert.deepEqual(await page.evaluate(() => window.updatedTransactions), [{ id: "tx-example", status: "VOIDED" }]);
      await trigger.click();
      await expect(menu.getByRole("button", { name: "Void", exact: true })).toHaveCount(0);
      await menu.getByRole("button", { name: "Hapus", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Hapus Transaksi?" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Batal", exact: true })).toBeFocused();
      await expect(dialog).toContainText(documentNumber);
      if (tx.suratJalanSummary) await expect(dialog).toContainText(/seluruh surat jalan.*dihapus/i);
      if (tx.draftNumber) await expect(dialog).toContainText(/tanpa bukti mutasi/i);

      if (example.name === "ATK") {
        await page.evaluate(() => { window.deleteError = "Penghapusan gagal. Silakan coba lagi."; });
        await dialog.getByRole("button", { name: "Ya, Hapus" }).click();
        await expect(dialog.getByRole("alert")).toContainText("Penghapusan gagal");
        assert.deepEqual(await page.evaluate(() => window.deletedIds), []);
        await page.evaluate(() => { window.deleteError = ""; window.pauseDelete = true; });
        await dialog.getByRole("button", { name: "Ya, Hapus" }).click();
        await expect(dialog.getByRole("button", { name: "Menghapus..." })).toBeDisabled();
        await expect(dialog.getByRole("button", { name: "Batal", exact: true })).toBeDisabled();
        await page.keyboard.press("Escape");
        await expect(dialog).toBeVisible();
        await page.evaluate(() => window.releaseDelete());
      } else {
        await dialog.getByRole("button", { name: "Ya, Hapus" }).click();
      }
      await expect(dialog).toHaveCount(0);
      const status = page.getByRole("status").filter({ hasText: /berhasil dihapus/i });
      await expect(status).toBeVisible();
      await expect(status).toBeInViewport();
      if (tx.draftNumber) await expect(status).toContainText(warning.message);
      assert.deepEqual(await page.evaluate(() => window.deletedIds), ["tx-example"]);
      assert.deepEqual(errors, []);
      if (width === 390 && tx.draftNumber) await page.screenshot({ path: path.join(root, "output/transaction-actions-baseline/quote-delete-warning-mobile.png") });
      await status.getByRole("button", { name: "Tutup pemberitahuan penghapusan" }).click();
      await expect(status).toHaveCount(0);
      await page.close();
      process.stdout.write(`${width}px ${example.name}: actions, dialog keyboard access, deletion feedback passed.\n`);
    }
  }
} finally {
  await browser.close();
}
