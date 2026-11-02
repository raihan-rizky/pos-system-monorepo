import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { bundleReactHarness, web } from "../../../product-stock-groups/__tests__/browser-harness.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const bundle = await bundleReactHarness(`
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { ProductImportDrawer } from './features/product-import/components/ProductImportDrawer';
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  createRoot(document.getElementById('root')).render(
    <QueryClientProvider client={client}><ProductImportDrawer open onClose={() => {}} /></QueryClientProvider>
  );
`, [
  "features/product-import/components/ProductImportDrawer.tsx",
  "features/product-import/components/ColumnMappingStep.tsx",
  "features/product-price-rounding/components/PriceRoundingPreview.tsx",
]);

const base = { name: "Kertas HVS", category: "Kertas", unit: "rim", price: 15000, stock: 0, minStock: 5, duplicateInFile: false, missingCategory: false, warnings: [], errors: [], autoAction: "create" };
const rows = [
  { ...base, rowNumber: 2, sku: "HVS-ISI", hargaAgen: 10000, hargaDinas: 20000 },
  { ...base, rowNumber: 3, sku: "HVS-NOL", hargaAgen: 0, hargaDinas: 0 },
  { ...base, rowNumber: 4, sku: "HVS-KOSONG", hargaAgen: null, hargaDinas: null },
  { ...base, rowNumber: 5, sku: "HVS-SEBAGIAN", hargaAgen: 10000, hargaDinas: null },
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://localhost:3019/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>' });
    if (url.pathname === "/api/settings/price-rounding") return route.fulfill({ json: { enabled: false, increment: 500, threshold: 50 } });
    if (url.pathname.endsWith("/preview")) return route.fulfill({ json: { rows, missingColumns: [], unknownColumns: [], warnings: [], errors: [], existingSkuMatches: [], missingCategories: [], requiredColumns: [], suggestions: {} } });
    return route.fulfill({ json: {} });
  });
  await page.goto("http://localhost:3019/fixture");
  await page.addStyleTag({ content: bundle.css });
  await page.addScriptTag({ content: bundle.script });
  await page.locator('input[type=file]').setInputFiles({
    name: "contoh-harga-hvs.csv", mimeType: "text/csv",
    buffer: Buffer.from("name,sku,category,price,unit,hargaAgen,hargaDinas\nKertas HVS,HVS-ISI,Kertas,15000,rim,10000,20000"),
  });
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByRole("button", { name: "Lanjut ke Preview", exact: true }).click();

  const cells = sku => page.getByRole("row").filter({ hasText: sku }).getByRole("cell");
  for (const sku of ["HVS-NOL", "HVS-KOSONG"]) {
    for (const index of [6, 7]) {
      const text = await cells(sku).nth(index).innerText();
      assert.match(text, /15\.000/, `${sku} uses the selling price instead of zero`);
      assert.match(text, /mengikuti harga jual/i);
      assert.match(text, /file.*(?:kosong|tidak tersedia|tidak ada).*0/i, "explains why the file price falls back");
    }
  }
  assert.match(await cells("HVS-ISI").nth(6).innerText(), /20\.000/);
  assert.match(await cells("HVS-ISI").nth(7).innerText(), /10\.000/);
  assert.doesNotMatch(await cells("HVS-ISI").nth(6).innerText(), /mengikuti harga jual/i);
  assert.match(await cells("HVS-SEBAGIAN").nth(6).innerText(), /15\.000/);
  assert.match(await cells("HVS-SEBAGIAN").nth(7).innerText(), /10\.000/);

  const tableBox = await page.getByRole("table").locator("..").boundingBox();
  const lastShownRow = await page.getByRole("row").filter({ hasText: "HVS-KOSONG" }).boundingBox();
  await page.screenshot({
    path: path.join(web, "public/images/changelog/prioritas-harga-agen-dinas-impor.png"),
    clip: { x: tableBox.x, y: tableBox.y, width: tableBox.width, height: lastShownRow.y + lastShownRow.height - tableBox.y },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.getByRole("table").isVisible(), "preview remains available on mobile");
  assert.match(await cells("HVS-KOSONG").nth(7).innerText(), /mengikuti harga jual/i);
  assert.deepEqual(errors, []);
  process.stdout.write("PASS actual import preview: file prices, independent zero/empty fallback, visible reasons, mobile table\n");
} finally {
  await browser.close();
}
