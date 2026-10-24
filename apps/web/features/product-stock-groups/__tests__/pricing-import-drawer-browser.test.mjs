import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { bundleReactHarness } from "./browser-harness.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const bundle = await bundleReactHarness(`import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {ProductImportDrawer} from './features/product-import/components/ProductImportDrawer';const client=new QueryClient({defaultOptions:{queries:{retry:false}}});createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><ProductImportDrawer open onClose={()=>{}}/></QueryClientProvider>);`, ["features/product-import/components/ProductImportDrawer.tsx", "features/product-import/components/ColumnMappingStep.tsx"]);
const row = { name: "Snowman", category: "Alat tulis", stock: 0, duplicateInFile: false, missingCategory: false, warnings: [], errors: [], autoAction: "auto_price_update" };
const rows = [
  { ...row, rowNumber: 2, sku: "SN-PCS", matchedProductId: "pcs", unit: "pcs", price: 3500, costPrice: 2500, pricingPreview: { price: 3500, costPrice: 2500, errors: [] } },
  { ...row, rowNumber: 3, sku: "SN-PAK", matchedProductId: "pak", unit: "pak", price: 37800, costPrice: null, pricingPreview: { price: 37800, costPrice: 30000, errors: [] } },
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const repreview = [], commits = [], errors = []; let release;
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://localhost:3019/**", async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>' });
    if (url.pathname.endsWith("/preview")) {
      if (!req.headers()["content-type"].includes("application/json")) return route.fulfill({ json: { rows, missingColumns: [], unknownColumns: [], warnings: [], errors: [], existingSkuMatches: [], missingCategories: [], requiredColumns: [], suggestions: {} } });
      const input = req.postDataJSON(); repreview.push(input);
      const skipped = input.decisions["2"] === "skip";
      const result = { rows: input.rows.map(r => ({ ...r, autoAction: r.rowNumber === 2 && skipped ? "auto_skip" : r.autoAction, pricingPreview: { price: r.price, costPrice: r.rowNumber === 3 ? skipped ? 24000 : 30000 : r.costPrice, errors: [] } })) };
      if (repreview.length === 2) { release = () => route.fulfill({ json: result }).catch(() => {}); return; }
      return route.fulfill({ json: result });
    }
    if (req.method() === "POST") commits.push(req.postDataJSON());
    return route.fulfill({ json: { id: "job", batchOperationId: "batch", status: "COMPLETED", totalRows: 2, processedRows: 2, successRows: 2, failedRows: 0, skippedRows: 0, summary: {} } });
  });
  await page.goto("http://localhost:3019/fixture"); await page.addStyleTag({ content: bundle.css }); await page.addScriptTag({ content: bundle.script });
  await page.locator('input[type=file]').setInputFiles({ name: "sample.csv", mimeType: "text/csv", buffer: Buffer.from("name,sku,category,price,stock,unit,costPrice\nSnowman,SN-PCS,Alat tulis,3500,0,pcs,2500") });
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByRole("button", { name: "Lanjut ke Preview", exact: true }).click();
  const source = page.getByRole("row").filter({ hasText: "SN-PCS" });
  const follower = page.getByRole("row").filter({ hasText: "SN-PAK" });
  const commit = page.getByRole("button", { name: "Commit Import", exact: true });
  await source.locator("select").selectOption("skip");
  await follower.getByText("24000", { exact: true }).waitFor();
  assert.equal(await source.locator("select").count(), 1, "skip remains reversible after repreview");
  await source.locator("select").selectOption("update");
  await page.waitForFunction(() => document.body.textContent.includes('Menghitung ulang harga sesuai pilihan baris'));
  assert.equal(await commit.isDisabled(), true);
  while (!release) await new Promise(resolve => setTimeout(resolve, 10));
  await source.locator("select").selectOption("skip");
  await follower.getByText("24000", { exact: true }).waitFor();
  await release();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent.includes('Commit Import')).disabled);
  assert.equal(await follower.getByText("30000", { exact: true }).count(), 0, "late response cannot replace latest choice");
  await Promise.all([page.waitForResponse(response => response.url().endsWith('/jobs')), commit.click()]);
  assert.equal(commits.length, 1); assert.equal(commits[0].rows[1].costPrice, null); assert.equal(commits[0].decisions["2"], "skip");
  assert.ok(repreview.every(input => input.rows[1].costPrice === null)); assert.deepEqual(errors, []);
  process.stdout.write("PASS actual import drawer: raw payload, reversible choices, pending gate, stale response guard\n");
} finally { await browser.close(); }
