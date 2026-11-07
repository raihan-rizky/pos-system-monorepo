// Run: node apps/web/features/inventory-management/components/__tests__/inbound-review-browser.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const repo = path.resolve(web, "../..");
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const bundle = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { InboundReceiptReviewModal } from './features/inventory-management/components/InboundReceiptReviewModal';
      const units = [
        { productId: 'p1', unit: 'dus', unitMultiplierToBase: 12, costPrice: 1200, price: 1500, hargaAgen: 1400, hargaDinas: 1300 },
        { productId: 'p2', unit: 'pcs', unitMultiplierToBase: 1, costPrice: 100, price: 125, hargaAgen: 120, hargaDinas: 110 },
      ];
      const saved = units.map(u => ({ ...u, priceEdited: false, original: {costPrice: u.costPrice, price: u.price, hargaAgen: u.hargaAgen, hargaDinas: u.hargaDinas}, pricingMode: 'MANUAL', pricingSourceProductId: null, pricingConfigRevision: null }));
      const makeLine = (id, productId, snapshot) => ({ id, productId, updatedAt: '2026-10-31T10:00:00.000Z', goodsPurchaseItemId: id, productNameSnapshot: id, skuSnapshot: id, unitSnapshot: 'pcs', expectedQuantity: 1, receivedQuantity: 1, costPriceSnapshot: 100, supplierCostPrice: 100, status: 'RECEIVED', matchStatus: 'MATCHED', reviewStatus: 'PENDING', note: null, pricingUnits: units, pricingSnapshot: snapshot });
      const collection = { version: 2, orderedUnitMultiplierToBase: 1, units: saved };
      const root = createRoot(document.getElementById('root'));
      window.requests = [];
      window.mountReceipt = mode => {
        const snapshot = mode === 'legacy' ? { version: 1, ...units[1], orderedUnitMultiplierToBase: 1 } : collection;
        window.fixtureReceipt = { id: 'receipt', goodsPurchaseId: 'purchase', goodsPurchaseNumber: 'PB-EXAMPLE', status: 'SUBMITTED', supplier: {name: 'Supplier Contoh'}, lines: [makeLine('line1', 'p1', snapshot), ...(mode === 'shared' ? [makeLine('line2', 'p2', collection)] : [])] };
        const replacementUnits = [{ productId: 'p3', unit: 'pcs', unitMultiplierToBase: 1, costPrice: 200, price: 250, hargaAgen: 240, hargaDinas: 230, pricingConfigRevision: 7 }];
        const renderComparison = pricingUnits => root.render(<InboundReceiptReviewModal key={mode} open receipt={window.fixtureReceipt} comparison={{items: mode === 'replacement' ? [{goodsPurchaseItemId: 'gpi3', productId: 'p3', productName: 'Pengganti', unit: 'pcs', remainingQuantity: 1, pricingUnits}] : []}} canApprove canEdit canReject onClose={() => {}} onSuccess={() => {}} />);
        window.refreshComparison = () => renderComparison(replacementUnits.map(unit => ({...unit, costPrice: 300, pricingConfigRevision: 8})));
        renderComparison(replacementUnits);
      };
      window.fetch = async (url, init = {}) => {
        if (init.method === 'PATCH') { window.requests.push(JSON.parse(init.body)); return new Response(JSON.stringify({data: {id: 'receipt', status: 'SUBMITTED'}, finalized: false}), {status: 200}); }
        return new Response(JSON.stringify({data: [window.fixtureReceipt]}), {status: 200});
      };
      window.mountReceipt('shared');
    `,
    resolveDir: web,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{
    name: "ui-fixture",
    setup(builder) {
      builder.onResolve({ filter: /^@pos\/ui$/ }, () => ({ path: "ui", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
        contents: "import React from 'react'; export const Modal = ({children, title}) => <div role='dialog'><h1>{title}</h1>{children}</div>; export const Button = ({children, variant, ...props}) => <button {...props}>{children}</button>;",
        loader: "tsx",
        resolveDir: web,
      }));
    },
  }],
});

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.locator('[name="reviewLines.line1.pricing.p1.price"]').fill("1600");
  page.once("dialog", async (dialog) => {
    assert.match(dialog.message(), /produk lain dalam grup/);
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Simpan Perubahan" }).click();
  assert.equal(await page.evaluate(() => window.requests.length), 0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Simpan Perubahan" }).click();
  await page.waitForFunction(() => window.requests.length === 1);
  assert.equal(await page.evaluate(() => window.requests[0].pricing.version), 2);

  await page.evaluate(() => window.mountReceipt("legacy"));
  await page.getByRole("button", { name: "Edit" }).click();
  assert.equal(await page.locator('[name="reviewLines.line1.pricing.p1.price"]').count(), 0);
  await page.locator('[name="reviewLines.line1.pricing.p2.price"]').fill("130");
  await page.getByRole("button", { name: "Simpan Perubahan" }).click();
  await page.waitForFunction(() => window.requests.length === 2);
  assert.deepEqual(await page.evaluate(() => window.requests[1].pricing), {
    productId: "p2", costPrice: 100, price: 130, hargaAgen: 120, hargaDinas: 110,
  });
  await page.evaluate(() => window.mountReceipt("replacement"));
  await page.getByRole("button", { name: "Edit" }).click();
  await page.locator('[name="reviewLines.line1.productId"]').selectOption("p3");
  await page.locator('[name="reviewLines.line1.pricing.p3.costPrice"]').fill("210");
  await page.evaluate(() => window.refreshComparison());
  await page.getByRole("button", { name: "Simpan Perubahan" }).click();
  await page.waitForFunction(() => window.requests.length === 3);
  assert.deepEqual(await page.evaluate(() => window.requests[2].pricing), {
    version: 2, units: [{ productId: "p3", costPrice: 210, price: 250, hargaAgen: 240, hargaDinas: 230, priceEdited: false,
      baseline: { unit: "pcs", unitMultiplierToBase: 1, costPrice: 200, price: 250, hargaAgen: 240, hargaDinas: 230,
        pricingMode: "MANUAL", pricingSourceProductId: null, pricingConfigRevision: 7 } }],
  });
  process.stdout.write("Inbound review confirmation, legacy pricing, and replacement baseline interactions passed.\n");
} finally {
  await browser.close();
}
