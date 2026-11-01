// Run from the repository root: node apps/web/features/bulk-stock-import/components/__tests__/bulk-stock-import-progress.browser.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const repo = path.resolve(web, "../..");
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium, expect } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");

const bundle = await build({
  stdin: {
    contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      import { BulkStockImportDrawer } from './features/bulk-stock-import/components/BulkStockImportDrawer';
      import { BulkStockImportProgressModal } from './features/bulk-stock-import/components/BulkStockImportProgressModal';
      import { useBulkStockImportJobTracking } from './features/bulk-stock-import/hooks/useBulkStockImport';
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      function Harness() {
        const tracking = useBulkStockImportJobTracking();
        const [drawerOpen, setDrawerOpen] = useState(false);
        return <main className="min-h-screen bg-slate-50 p-6">
          <h1 className="mb-4 text-xl font-bold">Produk</h1>
          <button className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"
            onClick={() => tracking.job ? tracking.open() : setDrawerOpen(true)}>
            {tracking.job ? 'Progres Impor Stok' : 'Impor'}
          </button>
          {drawerOpen && <BulkStockImportDrawer open onClose={() => setDrawerOpen(false)} onJobStarted={tracking.onJobStarted} />}
          <BulkStockImportProgressModal open={tracking.isOpen} job={tracking.job}
            isRefreshing={tracking.isRefreshing} refreshError={tracking.refreshError}
            onRefresh={tracking.refresh} onClose={tracking.close} />
        </main>;
      }
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
    `,
    resolveDir: web,
    loader: "tsx",
  },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web, "@pos/ui": path.join(repo, "packages/ui/src/index.ts") },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{
    name: "stock-import-supplier-fixture",
    setup(builder) {
      builder.onResolve({ filter: /features\/suppliers\/hooks\/useSuppliers$/ }, () => ({ path: "suppliers", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const useSuppliers = () => ({ data: { data: [] } });" }));
    },
  }],
});
const css = await postcss([tailwind({
  content: [path.join(web, "features/bulk-stock-import/components/*.tsx"), path.join(repo, "packages/ui/src/{Button,Modal}.tsx")],
  theme: { extend: { colors: { surface: require("tailwindcss/colors").slate, brand: require("tailwindcss/colors").blue } } },
})]).process("@tailwind base; @tailwind components; @tailwind utilities;", { from: undefined });

let job = null;
let anotherJob = null;
let latestActiveId = null;
let failPolling = false;
let failInitialDetail = false;
let submittedRows = [];
const previewRows = [
  { id: "product-a", name: "Produk Uji A", currentStock: 10, stock: 5 },
  { id: "product-b", name: "Produk Uji B", currentStock: 3, stock: 2 },
  { id: "product-c", name: "Produk Uji C", currentStock: 7, stock: 0 },
].map((row, index) => ({ ...row, rowNumber: index + 2, category: "Uji", unit: "pcs", productId: row.id,
  sku: `UJI-${index}`, status: "valid", warnings: [], errors: [], notes: [] }));
const runningJob = (id = "job-uji") => ({
  id, status: "RUNNING", phase: "UPDATING_STOCK", totalRows: 2, processedRows: 1,
  successRows: 0, failedRows: 0, result: null, errorMessage: null,
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://stock-import.test/**", async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/") return route.fulfill({ contentType: "text/html", body:
      `<html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>` });
    if (pathname === "/bundle.js") return route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text });
    if (pathname.endsWith("/preview")) return route.fulfill({ json: { rows: previewRows,
      summary: { validRows: 3, skippedRows: 0, errorRows: 0, warningRows: 0 }, missingColumns: [], requiredColumns: ["name", "unit", "stock"] } });
    if (pathname.endsWith("/jobs") && request.method() === "POST") {
      submittedRows = request.postDataJSON().rows;
      job = runningJob();
      return route.fulfill({ status: 201, json: job });
    }
    if (pathname.includes("/jobs/")) {
      if (failPolling) return route.fulfill({ status: 503, json: { message: "Koneksi sementara terganggu" } });
      if (pathname.endsWith("/active")) {
        const active = anotherJob ?? job;
        const running = ["PENDING", "RUNNING"].includes(active?.status) ? active : null;
        latestActiveId = running?.id ?? null;
        return route.fulfill({ json: { job: running } });
      }
      if (failInitialDetail) return route.fulfill({ status: 503, json: { message: "Detail sementara tidak tersedia" } });
      return route.fulfill({ json: anotherJob && pathname.endsWith(`/${anotherJob.id}`) ? anotherJob : job });
    }
    return route.fulfill({ status: 404 });
  });

  await page.goto("http://stock-import.test/");
  await page.getByRole("button", { name: "Impor", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "stok-uji.csv", mimeType: "text/csv", buffer: Buffer.from("nama,satuan,stok\nProduk Uji A,pcs,5") });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByRole("button", { name: "Terapkan Impor Stok", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  assert.equal(submittedRows.length, 2, "unchanged rows must not be submitted to the job");
  assert.deepEqual(submittedRows.map(row => row.stock), [5, 2]);
  await page.getByRole("button", { name: "Tutup modal" }).click();
  await page.getByRole("button", { name: "Progres Impor Stok", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Progres Impor Stok", exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "Progres Impor Stok", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");

  const screenshots = path.join(web, "public/images/changelog");
  await mkdir(screenshots, { recursive: true });
  await page.getByRole("dialog").screenshot({ path: path.join(screenshots, "progres-impor-stok.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile progress must fit the screen");
  await expect(page.getByRole("button", { name: "Tutup", exact: true })).toBeVisible();
  failPolling = true;
  await page.getByRole("button", { name: "Muat ulang", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Koneksi sementara terganggu");
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  failPolling = false;
  job = { ...job, status: "FAILED", phase: "FAILED", errorMessage: "Impor uji gagal" };
  await page.getByRole("button", { name: "Muat ulang", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Impor stok gagal");
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(page.getByRole("button", { name: "Impor", exact: true })).toBeVisible();

  job = runningJob("job-uji-selesai");
  await page.reload();
  await page.getByRole("button", { name: "Progres Impor Stok", exact: true }).click();
  job = { ...job, status: "COMMITTED", phase: "DONE", processedRows: 2, successRows: 2,
    result: { updatedProductCount: 2, inventoryLogCount: 2, batchOperationId: "batch-uji", status: "COMMITTED", pendingApproval: false, undoAvailable: true } };
  await page.getByRole("button", { name: "Muat ulang", exact: true }).click();
  await expect(page.getByText("2 stok berhasil diperbarui.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Impor", exact: true })).toBeVisible();

  job = runningJob("job-uji-pulih");
  failInitialDetail = true;
  await page.reload();
  await page.getByRole("button", { name: "Progres Impor Stok", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Detail sementara tidak tersedia");
  failInitialDetail = false;
  job = { ...job, status: "COMMITTED", phase: "DONE", processedRows: 2, successRows: 2,
    result: { updatedProductCount: 2, inventoryLogCount: 2, batchOperationId: "batch-pulih", status: "COMMITTED", pendingApproval: false, undoAvailable: true } };
  await expect(page.getByText("2 stok berhasil diperbarui.", { exact: true })).toBeVisible({ timeout: 6_000 });

  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  job = runningJob("job-pertama");
  await page.reload();
  await page.getByRole("button", { name: "Progres Impor Stok", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  job = { ...job, status: "COMMITTED", phase: "DONE", processedRows: 2, successRows: 2,
    result: { updatedProductCount: 1, inventoryLogCount: 1, batchOperationId: "batch-pertama", status: "COMMITTED", pendingApproval: false, undoAvailable: true } };
  anotherJob = runningJob("job-berikut");
  await page.getByRole("button", { name: "Muat ulang", exact: true }).click();
  await expect.poll(() => latestActiveId).toBe("job-berikut");
  await expect(page.getByRole("button", { name: "Muat ulang", exact: true })).toBeEnabled();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByText("1 stok berhasil diperbarui.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await page.getByRole("button", { name: "Progres Impor Stok", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  assert.deepEqual(errors, [], "no browser runtime errors");
  console.log("PASS: unchanged rows excluded; close/reopen, reload, mobile, keyboard, polling failure and final results verified.");
} finally {
  await browser.close();
}
