// Real component and query hooks with intercepted HTTP and fictional customer data.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const repo = path.resolve(web, "../..");
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const bundle = await build({
  stdin: { contents: `
    import React, {Suspense} from 'react';
    import {createRoot} from 'react-dom/client';
    import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
    import {CustomerRecapPanel} from './features/customer-recap/components/CustomerRecapPanel';
    const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
    createRoot(document.getElementById('root')).render(
      <QueryClientProvider client={client}><Suspense fallback={<p>Memuat rekap pelanggan...</p>}>
        <CustomerRecapPanel customerId="customer-example" range={{dateFrom:'2026-10-01',dateTo:'2026-10-20'}}/>
      </Suspense></QueryClientProvider>);
  `, resolveDir: web, loader: "tsx" },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web }, define: { "process.env.NODE_ENV": '"production"' },
});
const componentSource = await readFile(path.join(web, "features/customer-recap/components/CustomerRecapPanel.tsx"), "utf8");
const css = await require("postcss")([
  require("tailwindcss")({ content: [{ raw: componentSource, extension: "tsx" }] }),
]).process("@tailwind base; @tailwind utilities;", { from: undefined });
const artifacts = path.join(repo, "output/playwright/customer-detail-kpis");
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 850 } });
  await page.clock.install({ time: new Date("2026-10-20T10:00:00+07:00") });
  const errors = [], ranges = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://localhost:3004/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/customers/customer-example/recap") {
      const dateFrom = url.searchParams.get("dateFrom"), dateTo = url.searchParams.get("dateTo");
      ranges.push({ dateFrom, dateTo });
      const sevenDays = dateFrom === "2026-10-14", fourteenDays = dateFrom === "2026-10-07";
      await route.fulfill({ json: { data: {
        id: "customer-example", dateFrom, dateTo,
        summary: { totalSpent: 0, totalOrders: 0, avgOrderValue: 0, debtRemaining: 999000, debtPaidInPeriod: 45000,
          debtUnpaidInPeriod: sevenDays ? 0 : 110000, debtPaidOffInPeriod: sevenDays ? 0 : 70000,
          averagePaymentDays: sevenDays ? null : fourteenDays ? 0 : 2.5 },
        trend: { granularity: "daily", points: [] }, topProducts: [],
      } } });
      return;
    }
    await route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Uji KPI pelanggan</title><style>${css.css}</style><body style="font-family:Arial,sans-serif"><main style="max-width:880px;margin:auto;padding:16px"><div id="root"></div></main></body></html>` });
  });
  await page.goto("http://localhost:3004/__customer-detail-kpis");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const cards = page.getByRole("region", { name: "Ringkasan piutang periode" });
  await cards.getByText("2,5 hari", { exact: true }).waitFor();
  assert.deepEqual(ranges.at(-1), { dateFrom: "2026-09-21", dateTo: "2026-10-20" });
  assert.equal(await cards.locator("dt").count(), 3);
  assert.equal(await page.locator(".recharts-wrapper").count(), 0);
  assert.equal(await page.getByRole("button", { name: "30 Hari", exact: true }).getAttribute("aria-pressed"), "true");
  const boxes = await cards.locator("dl > div").evaluateAll(nodes => nodes.map(node => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y })));
  assert.ok(boxes.every(box => box.y === boxes[0].y) && boxes[1].x > boxes[0].x, "desktop has three columns");
  await page.getByRole("button", { name: "7 Hari", exact: true }).focus();
  await page.keyboard.press("Enter");
  await cards.getByText("Belum ada pelunasan", { exact: true }).waitFor();
  assert.deepEqual(ranges.at(-1), { dateFrom: "2026-10-14", dateTo: "2026-10-20" });
  assert.equal(await page.getByRole("button", { name: "7 Hari", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await cards.getByText("Rp 0", { exact: true }).count(), 2);
  await page.getByRole("button", { name: "14 Hari", exact: true }).click();
  await cards.getByText("0 hari", { exact: true }).waitFor();
  assert.deepEqual(ranges.at(-1), { dateFrom: "2026-10-07", dateTo: "2026-10-20" });
  await page.getByRole("button", { name: "30 Hari", exact: true }).click();
  await cards.getByText("2,5 hari", { exact: true }).waitFor();
  await page.locator("#root").screenshot({ path: path.join(web, "public/images/changelog/kpi-piutang-pelanggan.png") });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 950 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const mobileBoxes = await cards.locator("dl > div").evaluateAll(nodes => nodes.map(node => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y })));
    assert.ok(mobileBoxes.every(box => box.x === mobileBoxes[0].x) && mobileBoxes[1].y > mobileBoxes[0].y, "mobile stacks cards");
  }
  await page.screenshot({ path: path.join(artifacts, "mobile.png") });
  assert.deepEqual(errors, []);
  process.stdout.write("PASS: desktop/mobile cards, no overflow, keyboard selection, WIB 7/14/30-day ranges, null versus zero days, and safe screenshot.\n");
} finally {
  await browser.close();
}
