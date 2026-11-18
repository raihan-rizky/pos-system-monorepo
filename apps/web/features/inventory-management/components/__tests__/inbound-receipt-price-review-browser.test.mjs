import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const repo = path.resolve(web, "../..");
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");

const bundle = await build({
  stdin: { contents: "\nimport React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { InboundReceiptReviewModal } from './features/inventory-management/components/InboundReceiptReviewModal';\nconst current = { productId: 'binder-pak', unit: 'Pak', unitMultiplierToBase: 12, costPrice: 25992,\n  price: 40000, hargaAgen: 0, hargaDinas: null, pricingMode: 'MANUAL',\n  pricingSourceProductId: 'binder', pricingConfigRevision: 4 };\nconst receipt = { id: 'receipt', goodsPurchaseId: 'purchase', goodsPurchaseNumber: 'PB-TEST-001',\n  status: 'SUBMITTED', supplier: null, lines: [{\n    id: 'line', updatedAt: '2026-11-16T09:49:32.494Z', productId: 'binder-pak',\n    goodsPurchaseItemId: 'purchase-item', productNameSnapshot: 'Binder Clips No 105', skuSnapshot: 'BC-001-PAK',\n    unitSnapshot: 'Pak', expectedQuantity: 2, receivedQuantity: 2, costPriceSnapshot: 25000,\n    supplierCostPrice: 25992, status: 'RECEIVED', matchStatus: 'MATCHED', reviewStatus: 'PENDING', note: null,\n    pricingUnits: [current], pricingSnapshot: { version: 2, orderedUnitMultiplierToBase: 12, units: [{\n      productId: 'binder-pak', unit: 'Pak', unitMultiplierToBase: 12, costPrice: 25992, price: 4000,\n      hargaAgen: 0, hargaDinas: null, priceEdited: true,\n      original: { costPrice: 25000, price: 38000, hargaAgen: 0, hargaDinas: null },\n      pricingMode: 'MANUAL', pricingSourceProductId: 'binder', pricingConfigRevision: 3\n    }] }\n  }] };\nwindow.reviewPatches = [];\nwindow.reviewApprovals = [];\nwindow.confirm = () => true;\nwindow.fetch = async (url, options = {}) => {\n  if (options.method === 'PATCH') {\n    window.reviewPatches.push(JSON.parse(options.body));\n    return new Response(JSON.stringify({ data: { id: 'receipt', status: 'SUBMITTED' }, finalized: false }),\n      { status: 200, headers: { 'Content-Type': 'application/json' } });\n  }\n  if (options.method === 'POST') {\n    window.reviewApprovals.push({ url: String(url), body: JSON.parse(options.body) });\n    return new Response(JSON.stringify({ data: { id: 'receipt', status: 'APPROVED' }, finalized: true, pricingWarningProductIds: ['binder-pak'] }),\n      { status: 200, headers: { 'Content-Type': 'application/json' } });\n  }\n  const data = String(url).includes('receiving-comparison') ? { items: [] } : [receipt];\n  return new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });\n};\ncreateRoot(document.getElementById('root')).render(\n  <InboundReceiptReviewModal open receipt={receipt} canApprove canEdit canReject\n    onClose={() => {}} onSuccess={(message) => { window.reviewSuccess = message; }} />\n);\n", resolveDir: web, loader: "tsx" },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  alias: { "@": web },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{
    name: "ui-test-shell",
    setup(builder) {
      builder.onResolve({ filter: /^@pos\/ui$/ }, () => ({ path: "ui", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
        contents: "import React from 'react'; export const Modal = ({open,title,children}) => open ? <section role='dialog' aria-label={title}>{children}</section> : null; export const Button = ({children,variant,...props}) => <button {...props}>{children}</button>;",
        loader: "jsx",
        resolveDir: web,
      }));
    },
  }],
});

const componentPath = path.join(web, "features/inventory-management/components/InboundReceiptReviewModal.tsx");
const css = await postcss([tailwind({
  content: [{ raw: await readFile(componentPath, "utf8"), extension: "tsx" }],
})]).process("@tailwind base; @tailwind components; @tailwind utilities;", { from: undefined });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent("<!doctype html><html lang='id'><head></head><body><div id='root'></div></body></html>");
  await page.addStyleTag({ content: css.css });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });

  await page.getByText("Tinjau harga", { exact: true }).waitFor();
  assert.match(await page.locator("body").innerText(), /Rp 4\.000/);
  assert.match(await page.locator("body").innerText(), /Rp 40\.000/);
  await page.getByRole("button", { name: "Setujui Item" }).click();
  await page.waitForFunction(() => window.reviewApprovals.length === 1 && window.reviewSuccess);
  assert.match(await page.evaluate(() => window.reviewApprovals[0].url), /\/items\/line\/approval$/);
  assert.match(await page.evaluate(() => window.reviewSuccess), /harga produk terkini dipertahankan untuk 1 produk/i);
  assert.equal(await page.evaluate(() => window.reviewPatches.length), 0);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Simpan Perubahan" }).click();
  await page.getByRole("alert").getByText(/centang persetujuan/i).waitFor();
  assert.equal(await page.evaluate(() => window.reviewPatches.length), 0);

  const confirmation = page.getByRole("checkbox", { name: /Saya sudah memeriksa harga produk terbaru/ });
  await confirmation.focus();
  await page.keyboard.press("Space");
  assert.equal(await confirmation.isChecked(), true);
  await page.getByRole("button", { name: "Simpan Perubahan" }).click();
  await page.waitForFunction(() => window.reviewPatches.length === 1);
  const payload = await page.evaluate(() => window.reviewPatches[0]);
  assert.equal(payload.pricing.units[0].price, 4000);
  assert.equal(payload.pricing.units[0].baseline.price, 40000);
  assert.equal(payload.pricing.units[0].baseline.pricingConfigRevision, 4);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  console.log("Price review comparison, confirmation, payload, keyboard, and mobile width passed.");
} finally {
  await browser.close();
}
