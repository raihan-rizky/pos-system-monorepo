// Real dialog and download adapter, with synthetic reports and intercepted requests.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const repo = process.cwd();
const web = path.join(repo, "apps/web");
const require = createRequire(path.join(web, "package.json"));
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium, expect } = require("@playwright/test");
const bundle = await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';
    import {ReportExportMenu} from './features/financial-report/components/ReportExportMenu';
    window.legacyExports=[];
    createRoot(document.getElementById('root')).render(<main className="p-6"><h1 className="mb-5 text-xl font-semibold">Laporan Keuangan</h1><ReportExportMenu/></main>);`, resolveDir: web, loader: "tsx" },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web }, define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "isolated-export-boundaries", setup(build) {
    build.onResolve({ filter: /journal-export$/ }, () => ({ path: "journal-export", namespace: "fixture" }));
    build.onResolve({ filter: /monthly-workbook$/ }, () => ({ path: "monthly-workbook", namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: name }) => ({ contents: name === "journal-export"
      ? "export async function exportFinancialReportFile(period,format){window.legacyExports.push({period,format});}"
      : `export function serializeMonthlyWorkbook(){return new Uint8Array([80,75]);}` }));
  } }],
});
const source = await readFile(path.join(web, "features/financial-report/components/ReportExportMenu.tsx"), "utf8");
const buttonSource = await readFile(path.join(repo, "packages/ui/src/Button.tsx"), "utf8");
const theme = require("tailwindcss/loadConfig")(path.join(repo, "packages/config/tailwind.config.ts"));
const css = await require("postcss")([require("tailwindcss")({ ...theme, content: [{ raw: source + buttonSource, extension: "tsx" }] })]).process("@tailwind base; @tailwind utilities;", { from: undefined });
const html = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Contoh ekspor laporan keuangan</title><style>${css.css}body{font-family:Inter,system-ui,sans-serif;background:#f8fafc;color:#0f172a}</style><body><div id="root"></div></body></html>`;
const output = path.join(repo, "output/playwright/monthly-financial-export");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [1200, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1200 ? 950 : 740 }, acceptDownloads: true });
    // This instant is already 21 October in WIB, while still 20 October in UTC.
    await page.clock.install({ time: new Date("2026-10-20T18:30:00Z") });
    const errors = [], requests = [];
    page.on("pageerror", error => errors.push(error.message));
    let release, fail = false, hold = false;
    await page.route("http://monthly-export.test/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/finance/report/monthly") {
        requests.push(Object.fromEntries(url.searchParams));
        if (hold) await new Promise(resolve => { release = resolve; });
        return route.fulfill({ status: fail ? 500 : 200, json: fail ? { message: "Data laporan belum dapat dimuat." } : { year: 2026, month: 9, from: "2026-09-01", to: "2026-09-30", income: [], expenses: [], receivables: [], inventoryBalance: null, supplierDebtBalance: null, warnings: [] } });
      }
      return route.fulfill({ contentType: "text/html", body: html });
    });
    await page.goto("http://monthly-export.test/");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const trigger = page.getByRole("button", { name: "Ekspor", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Ekspor laporan keuangan" });
    await expect(dialog).toBeVisible({ timeout: 3000 });
    await expect(page.getByLabel("Jenis laporan")).toBeFocused();
    await expect(page.getByLabel("Jenis laporan")).toHaveValue("monthly");
    await expect(page.getByLabel("Bulan", { exact: true })).toHaveValue("10");
    await expect(page.getByLabel("Tahun", { exact: true })).toHaveValue("2026");
    await expect(dialog.getByText("1–21 Oktober 2026", { exact: true })).toBeVisible();
    assert.equal(await page.getByLabel("Bulan", { exact: true }).locator('option[value="11"]').isDisabled(), true);
    await page.getByLabel("Tahun", { exact: true }).fill("2025");
    assert.equal(await page.getByLabel("Bulan", { exact: true }).locator('option[value="11"]').isDisabled(), false);
    await page.getByLabel("Tahun", { exact: true }).fill("2026");
    await page.getByLabel("Bulan", { exact: true }).selectOption("9");
    await expect(dialog.getByText("1–30 September 2026", { exact: true })).toBeVisible();
    assert.equal(await page.getByRole("list", { name: "Tujuh sheet Excel" }).getByRole("listitem").count(), 7);
    await expect(dialog.getByText("Modal awal diisi sendiri di Excel.", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Persediaan akhir dan hutang pemasok/)).toBeVisible();
    for (let index = 0; index < 14; index++) {
      await page.keyboard.press("Tab");
      const focus = await dialog.evaluate(element => ({ inside: element.contains(document.activeElement), active: document.activeElement?.tagName, id: document.activeElement?.id }));
      assert.equal(focus.inside, true, `Fokus tetap di dalam dialog: Tab ${index + 1}, ${JSON.stringify(focus)}`);
    }
    await page.getByRole("button", { name: "Tutup", exact: true }).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "Unduh Excel", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByLabel("Bulan", { exact: true }).selectOption("9");
    fail = true; hold = true;
    await page.getByRole("button", { name: "Unduh Excel", exact: true }).click();
    await expect(page.getByRole("button", { name: "Menyiapkan Excel…" })).toBeDisabled();
    await page.waitForFunction(() => document.querySelector('dialog form')?.getAttribute('aria-busy') === 'true');
    // Even a programmatic double submission cannot start a second request.
    await page.locator("dialog form").evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    await expect.poll(() => requests.length).toBe(1);
    await expect(page.getByLabel("Bulan", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Tutup", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    release();
    await expect(page.getByRole("alert")).toHaveText("Data laporan belum dapat dimuat.");
    await expect(page.getByRole("alert")).toBeInViewport();
    await expect(page.getByLabel("Bulan", { exact: true })).toHaveValue("9");
    fail = false; hold = false;
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "laporan-keuangan-2026-09.xlsx");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1], { year: "2026", month: "9" });
    await trigger.click();
    await page.getByLabel("Jenis laporan").selectOption("journal");
    for (const format of ["xlsx", "pdf"]) {
      for (const period of ["daily", "weekly", "30d", "monthly"]) {
        await page.getByLabel("Format").selectOption(format);
        await page.getByLabel("Periode jurnal").selectOption(period);
        await page.getByRole("button", { name: format === "pdf" ? "Unduh PDF" : "Unduh Excel", exact: true }).click();
        await expect(dialog).not.toBeVisible();
        await trigger.click();
        await page.getByLabel("Jenis laporan").selectOption("journal");
      }
    }
    assert.deepEqual(await page.evaluate(() => window.legacyExports), ["xlsx", "pdf"].flatMap(format => ["daily", "weekly", "30d", "monthly"].map(period => ({ period, format }))));
    await page.getByLabel("Jenis laporan").selectOption("monthly");
    await page.getByLabel("Bulan", { exact: true }).selectOption("9");
    await page.getByRole("button", { name: "Unduh Excel", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Unduh Excel", exact: true })).toBeInViewport();
    const scrollable = dialog.locator("form > div").first();
    await scrollable.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(dialog.getByText(/Persediaan akhir dan hutang pemasok/)).toBeInViewport();
    await scrollable.evaluate(element => { element.scrollTop = 0; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await dialog.evaluate(element => element.getBoundingClientRect().height <= innerHeight), true);
    await page.screenshot({ path: path.join(output, `dialog-${width}.png`) });
    if (width === 1200) {
      await mkdir(path.join(web, "public/images/changelog"), { recursive: true });
      await dialog.screenshot({ path: path.join(web, "public/images/changelog/ekspor-keuangan-bulanan.png") });
    }
    await page.getByRole("button", { name: "Tutup", exact: true }).click();
    await expect(trigger).toBeFocused();
    assert.deepEqual(errors, []);
    process.stdout.write(`PASS ${width}px: WIB, 7 sheets, keyboard/focus/Escape, busy guard, error/retry/download, all journal/PDF periods, responsive controls\n`);
    await page.close();
  }
} finally { await browser.close(); }
