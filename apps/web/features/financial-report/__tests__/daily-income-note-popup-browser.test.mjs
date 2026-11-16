import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const repo = process.cwd();
const web = path.join(repo, "apps/web");
const require = createRequire(path.join(web, "package.json"));
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("vitest")] }));
const { chromium, expect } = require("@playwright/test");
const source = await readFile(path.join(web, "features/financial-report/components/DailyIncomeReceiptDialog.tsx"), "utf8");
const modalSource = await readFile(path.join(repo, "packages/ui/src/Modal.tsx"), "utf8");
const testSource = await readFile(new URL(import.meta.url), "utf8");
const theme = require("tailwindcss/loadConfig")(path.join(repo, "packages/config/tailwind.config.ts"));
const css = await require("postcss")([require("tailwindcss")({ ...theme, content: [source, modalSource, testSource].map(raw => ({ raw, extension: "tsx" })) })])
  .process("@tailwind base;@tailwind utilities;", { from: undefined });
const html = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}body{font-family:system-ui,sans-serif;background:#f3f7fa}</style><body><div id="root"></div></body></html>`;

const bundle = await build({
  stdin: {
    contents: `
      import React, { useState } from "react";
      import { createRoot } from "react-dom/client";
      import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
      import { DailyIncomeReceiptDialog } from "./features/financial-report/components/DailyIncomeReceiptDialog";
      const fixture = {
        items: [
          { transactionId: "tx-regular", invoiceNumber: "INV-001", date: "2026-11-08", amount: 100000, methods: ["CASH"], paymentBreakdown: [{ method: "CASH", amount: 100000 }], categoryBreakdown: [{ category: "ATK", amount: 100000 }] },
          { transactionId: "tx-receivable", invoiceNumber: "INV-PIUTANG-001", date: "2026-11-08", amount: 50000, methods: ["TRANSFER"], isReceivableNota: true, paymentBreakdown: [{ method: "TRANSFER", amount: 50000 }], categoryBreakdown: [] },
        ],
        manualEntries: [{ id: "manual-1", description: "Pemasukan manual contoh", date: "2026-11-08", amount: 30000, paymentBreakdown: [{ method: "CASH", amount: 30000 }], categoryBreakdown: [] }],
        manualReceivableEntries: [{ id: "manual-2", customerName: "Pelanggan contoh", date: "2026-11-08", amount: 25000, paymentBreakdown: [{ method: "CASH", amount: 25000 }], categoryBreakdown: [] }],
        manualDetailsAvailable: true,
        manualReceivableDetailsAvailable: true,
        summary: { total: 205000, paymentMethods: [{ method: "CASH", amount: 155000 }, { method: "TRANSFER", amount: 50000 }] },
        comparisonAccess: { read: false, create: false, update: false },
      };
      window.__receiptFixture = fixture;
      function App() {
        const [open, setOpen] = useState(false);
        const previewSales = new URL(location.href).searchParams.has("preview");
        return <><button type="button" onClick={() => setOpen(true)}>Buka rincian</button>{open && <DailyIncomeReceiptDialog date="2026-11-08" previewSales={previewSales} onClose={() => setOpen(false)} />}</>;
      }
      createRoot(document.getElementById("root")).render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><App /></QueryClientProvider>);
    `,
    resolveDir: web,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  alias: { "@": web, "@pos/ui": path.join(repo, "packages/ui/src/Modal.tsx") },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{
    name: "income-note-popup-test-boundaries",
    setup(builder) {
      for (const filter of [/providers\/RoleProvider$/, /^next\/link$/, /^next\/dynamic$/, /useReceiptHistory$/, /hooks\/useTransactions$/, /components\/ReceiptModal$/, /DailyIncomeComparison$/]) {
        builder.onResolve({ filter }, ({ path: name }) => ({ path: name, namespace: "fixture" }));
      }
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: name }) => {
        const contents = name === "next/link"
          ? `import React from "react"; export default function Link({ href, children, ...props }) { return <a href={href} {...props}>{children}</a>; }`
          : name === "next/dynamic"
            ? `import React from "react"; import { ReceiptHistoryReceiptDialog } from "@/features/transaction-history/components/ReceiptHistoryReceiptDialog"; export default function dynamic() { return function ReceiptPopup(props) { return <ReceiptHistoryReceiptDialog {...props} />; }; }`
            : name.endsWith("RoleProvider")
              ? `export function useRole() { return { userId: "user-a", storeId: "store-a", authorizationFingerprint: "grant-a" }; }`
              : name.endsWith("useReceiptHistory")
                ? `export class ReceiptHistoryError extends Error {} export function useReceiptHistory() { return { data: window.__receiptFixture, isLoading: false, error: null, refetch: async () => {} }; }`
                : name.endsWith("DailyIncomeComparison")
                  ? `export function DailyIncomeComparison() { return null; }`
                  : name.includes("useTransactions")
                    ? `export function useTransaction(transactionId) { const invoiceNumber = transactionId === "tx-regular" ? "INV-001" : "INV-PIUTANG-001"; const loading = new URL(location.href).searchParams.has("loading"); return { data: loading ? undefined : { id: transactionId, invoiceNumber, status: "COMPLETED", items: [], amount: 100000, paidAmount: 100000, changeAmount: 0 }, isLoading: loading, error: null, refetch: async () => {} }; }`
                    : name.endsWith("ReceiptModal")
                      ? `import React from "react"; import { Modal } from "@pos/ui"; export function ReceiptModal({ onClose, portalRoot, transaction }) { return <Modal open onClose={onClose} title="Popup nota" size="2xl" portalRoot={portalRoot}><div className="space-y-4"><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-[#587586]">Nomor nota</span><span className="font-semibold">{transaction.invoiceNumber}</span></div><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-[#587586]">Pelanggan</span><span className="font-semibold">Pelanggan contoh</span></div><div className="flex flex-wrap justify-between gap-2 rounded-xl border border-[#dce9ed] bg-[#f6fafc] p-4 text-sm"><span>1 × Alat Tulis</span><span className="font-mono font-semibold tabular-nums">Rp 100.000</span></div><div className="flex justify-between border-t border-[#dce9ed] pt-4 text-base font-bold"><span>Total</span><span className="font-mono tabular-nums">Rp 100.000</span></div><p className="text-xs text-[#587586]">Transaksi contoh {transaction.id} · 8 November 2026</p></div></Modal>; }`
                  : `export function ReceiptHistoryReceiptDialog() { return null; }`;
        return { resolveDir: web, loader: "tsx", contents };
      });
    },
  }],
});

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await context.route("http://income.local/**", route => route.fulfill({ contentType: "text/html", body: html }));
  const page = await context.newPage();
  await page.goto("http://income.local/");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole("button", { name: "Buka rincian" }).click();
  const receiptDetails = page.getByRole("dialog", { name: "Rincian pemasukan" });
  await expect(receiptDetails).toContainText("INV-001");
  await expect(receiptDetails).toContainText("INV-PIUTANG-001");
  await expect(receiptDetails).toContainText("Pemasukan manual contoh");

  const regularNoteButton = page.getByRole("button", { name: "Lihat nota INV-001" });
  const receivableNoteButton = page.getByRole("button", { name: "Lihat nota INV-PIUTANG-001" });
  assert.equal(await regularNoteButton.count(), 1, "nota biasa harus punya tombol untuk membuka popup");
  assert.equal(await receivableNoteButton.count(), 1, "Piutang Nota harus punya tombol untuk membuka popup");
  assert.equal(await page.getByRole("button", { name: /Lihat nota Pemasukan manual/ }).count(), 0, "pemasukan manual tidak membuka popup nota");
  assert.equal(await page.getByRole("button", { name: /Lihat nota Pelanggan contoh/ }).count(), 0, "Piutang Manual tidak membuka popup nota");

  await regularNoteButton.click();
  const receiptPopup = page.getByRole("dialog", { name: "Popup nota" });
  await expect(receiptPopup).toContainText("tx-regular");
  if (process.env.RECEIPT_POPUP_SCREENSHOT_PATH) {
    await mkdir(path.dirname(process.env.RECEIPT_POPUP_SCREENSHOT_PATH), { recursive: true });
    await page.screenshot({ path: process.env.RECEIPT_POPUP_SCREENSHOT_PATH });
  }
  const popupLayerInfo = await page.evaluate(() => {
    const popup = document.querySelector('[aria-labelledby="modal-popup-nota-title"]');
    return popup ? { popupParent: popup.parentElement?.tagName, popupInsideReport: Boolean(popup.closest("dialog")) } : null;
  });
  assert.equal(popupLayerInfo?.popupInsideReport, true, `portal popup nota harus berada di dalam modal rincian: ${JSON.stringify(popupLayerInfo)}`);
  await page.keyboard.press("Escape");
  await expect(receiptPopup).toBeHidden();
  await expect(receiptDetails).toBeVisible();
  await expect(regularNoteButton).toBeFocused();
  await regularNoteButton.click();
  await expect(receiptPopup).toContainText("tx-regular");
  await receiptPopup.getByRole("button", { name: "Tutup modal" }).click();
  await expect(regularNoteButton).toBeFocused();

  await receivableNoteButton.click();
  await expect(receiptPopup).toContainText("tx-receivable");
  await receiptPopup.getByRole("button", { name: "Tutup modal" }).click();
  await expect(receivableNoteButton).toBeFocused();

  const previewPage = await context.newPage();
  await previewPage.goto("http://income.local/?preview");
  await previewPage.addScriptTag({ content: bundle.outputFiles[0].text });
  await previewPage.getByRole("button", { name: "Buka rincian" }).click();
  const previewDetails = previewPage.getByRole("dialog", { name: "Rincian pemasukan" });
  await expect(previewDetails).toContainText("INV-001");
  assert.equal(await previewPage.getByRole("button", { name: "Lihat nota INV-001" }).count(), 0, "pratinjau Sales mempertahankan pembatasan popup nota");

  const loadingPage = await context.newPage();
  await loadingPage.goto("http://income.local/?loading");
  await loadingPage.addScriptTag({ content: bundle.outputFiles[0].text });
  await loadingPage.getByRole("button", { name: "Buka rincian" }).click();
  await loadingPage.getByRole("button", { name: "Lihat nota INV-001" }).click();
  const loadingPopup = loadingPage.getByRole("dialog", { name: "Rincian nota" });
  await expect(loadingPopup).toContainText("Memuat nota...");
  const loadingPopupIsInsideReport = await loadingPage.evaluate(() => {
    const popup = document.querySelector('[aria-labelledby="modal-rincian-nota-title"]');
    return Boolean(popup?.closest("dialog"));
  });
  assert.equal(loadingPopupIsInsideReport, true, "dialog status nota harus berada di atas rincian harian selama memuat");
} finally {
  await browser.close();
}
