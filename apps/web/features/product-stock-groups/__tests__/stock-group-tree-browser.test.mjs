// Run: node apps/web/features/product-stock-groups/__tests__/stock-group-tree-browser.test.mjs
// Exercises the production dialog with clearly labelled fixtures; no store data is written.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const repo = path.resolve(web, "../..");
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const bundle = await build({
  stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
    import {StockGroupWorkspaceModal} from './features/product-stock-groups/components/StockGroupWorkspace';
    import {treeDetail} from './features/product-stock-groups/components/__tests__/stock-group-tree-fixture';
    const root = createRoot(document.getElementById('root'));
    let revision = 0;
    window.renderGroup = (options = {}) => {
      window.fixtureDetail = options.detail || structuredClone(treeDetail);
      const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
      root.render(<QueryClientProvider client={client} key={++revision}>
        <StockGroupWorkspaceModal stockGroupId={window.fixtureDetail.id}
          onClose={() => root.render(null)}
          onSaved={() => {}} canUpdateStock={options.canUpdateStock ?? true}
          canUpdateProducts={options.canUpdateProducts ?? true}
          canCreateProducts={options.canCreateProducts ?? true} />
      </QueryClientProvider>);
    };
    window.renderGroup();
  `, resolveDir: web, sourcefile: "stock-tree-harness.tsx", loader: "tsx" },
  bundle: true, write: false, outdir: "fixture", platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web }, define: { "process.env.NODE_ENV": '"production"' },
});
const sources = await Promise.all([
  "features/product-stock-groups/components/StockGroupWorkspace.tsx",
  "features/product-stock-groups/components/WorkspacePanels.tsx",
  "features/product-stock-groups/components/StockGroupHistory.tsx",
].map(file => readFile(path.join(web, file), "utf8")));
const css = await postcss([tailwind({ content: sources.map(raw => ({ raw, extension: "tsx" })) })])
  .process("@tailwind base; @tailwind components; @tailwind utilities;", { from: undefined });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const artifacts = path.join(repo, "output/playwright/stock-group-tree");
await mkdir(artifacts, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://localhost:3004/__stock-tree-fixture", route => route.fulfill({
    contentType: "text/html", body: '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="background:#e8edf5"><div id="root"></div></body></html>',
  }));
  await page.route("**/api/product-stock-groups/*", async route => {
    const detail = await page.evaluate(() => window.fixtureDetail);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(detail) });
  });
  await page.goto("http://localhost:3004/__stock-tree-fixture");
  await page.addStyleTag({ content: css.css });
  for (const file of bundle.outputFiles.filter(file => file.path.endsWith(".css"))) {
    await page.addStyleTag({ content: file.text });
  }
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });
  const tree = page.getByRole("figure", { name: "Pohon persediaan" });
  const panel = page.getByRole("tabpanel");
  await tree.waitFor();
  assert.equal(await tree.getByRole("listitem", { name: /^Satuan / }).count(), 3);
  assert.equal(await tree.getByText("1 rim = 500 lembar", { exact: true }).count(), 1);

  const rootRect = await tree.getByRole("region", { name: "Stok bersama" }).boundingBox();
  const leafRect = await tree.getByRole("listitem", { name: "Satuan lembar", exact: true }).boundingBox();
  assert.ok(rootRect.x + rootRect.width < leafRect.x, "desktop branches extend beside the stock root");
  await page.getByRole("dialog").screenshot({ path: path.join(artifacts, "desktop.png") });
  await tree.screenshot({ path: path.join(repo, "apps/web/public/images/changelog/pohon-persediaan-produk.png") });

  await page.getByRole("button", { name: "Atur konversi satuan", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.getByRole("tab", { name: "Satuan", exact: true }).getAttribute("aria-selected"), "true");
  await page.getByLabel("Satuan acuan", { exact: true }).waitFor();
  assert.equal(await page.getByRole("tab", { name: "Satuan", exact: true }).evaluate(el => el === document.activeElement), true,
    "keyboard shortcuts move focus to the destination tab");
  await page.getByRole("tab", { name: "Ringkasan", exact: true }).click();
  await page.getByRole("button", { name: "Atur harga satuan", exact: true }).click();
  await page.getByRole("heading", { name: "Harga per satuan", exact: true }).waitFor();
  await page.getByRole("tab", { name: "Ringkasan", exact: true }).click();
  await page.getByRole("button", { name: "Tambah satuan ke grup", exact: true }).click();
  await page.getByLabel("Nama satuan", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Ringkasan", exact: true }).click();

  await page.getByRole("tab", { name: "Ringkasan", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("tab", { name: "Satuan", exact: true }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press("Home");
  await tree.waitFor();
  process.stdout.write("PASS: real dialog, connected units, shortcuts, Enter activation, focus transfer and arrow-key tabs.\n");

  const originalDetail = await page.evaluate(() => structuredClone(window.fixtureDetail));
  await page.evaluate(() => window.renderGroup({ detail: {
    ...window.fixtureDetail, variants: [window.fixtureDetail.variants[0]], conversionPairs: [],
  } }));
  await page.waitForFunction(() => document.querySelectorAll('li[aria-label^="Satuan "]').length === 1);
  const singleRoot = await tree.getByRole("region", { name: "Stok bersama" }).boundingBox();
  const singleBranch = await tree.getByRole("listitem", { name: "Satuan lembar", exact: true }).boundingBox();
  assert.ok(Math.abs((singleRoot.y + singleRoot.height / 2) - (singleBranch.y + singleBranch.height / 2)) <= 2,
    "a single unit connects at the same height as the shared stock root");
  await page.evaluate(detail => window.renderGroup({detail}), originalDetail);
  await page.waitForFunction(() => document.querySelectorAll('li[aria-label^="Satuan "]').length === 3);
  process.stdout.write("PASS: a single unit stays connected to the shared stock root.\n");

  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await tree.scrollIntoViewIfNeeded();
    assert.equal(await panel.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `no panel overflow at ${width}px`);
    assert.equal(await tree.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `no tree overflow at ${width}px`);
    const rootBox = await tree.getByRole("region", { name: "Stok bersama" }).boundingBox();
    const firstBox = await tree.getByRole("listitem", { name: "Satuan lembar", exact: true }).boundingBox();
    if (width < 768) assert.ok(rootBox.y + rootBox.height < firstBox.y, "phone branches descend from the root");
    await page.getByRole("dialog").screenshot({ path: path.join(artifacts, `mobile-${width}.png`) });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await tree.locator("article").first().evaluate(el => getComputedStyle(el).transitionDuration), "0s");
  await page.emulateMedia({ forcedColors: "active" });
  await page.getByRole("dialog").screenshot({ path: path.join(artifacts, "high-contrast.png") });
  await page.emulateMedia({ forcedColors: "none" });
  process.stdout.write("PASS: 768px, 390px and 320px layouts, reduced motion and forced-color connectors.\n");

  await page.evaluate(() => window.renderGroup({ canUpdateStock: false, canUpdateProducts: false, canCreateProducts: false }));
  await tree.waitFor();
  assert.equal(await tree.getByRole("button").count(), 0, "read-only users have no edit shortcuts");
  assert.equal(await page.getByRole("button", { name: "Tetapkan stok akhir", exact: true }).count(), 0);

  await page.evaluate(() => {
    const detail = structuredClone(window.fixtureDetail);
    detail.displayName = "Contoh nama grup panjang ".repeat(6);
    detail.variants = Array.from({length: 8}, (_, i) => ({...detail.variants[i % 3], id: `unit-${i}`, name: "Contoh nama produk panjang ".repeat(4), sku: "CONTOH-SKU-TANPA-SPASI-".repeat(6), unit: `satuan-panjang-contoh-${i}`}));
    window.renderGroup({detail});
  });
  await tree.getByRole("listitem", { name: "Satuan satuan-panjang-contoh-7", exact: true }).waitFor();
  assert.equal(await panel.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, "long content fits a phone");
  assert.equal(await tree.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, "long unit names and unbroken SKUs wrap");
  await tree.getByRole("listitem").last().scrollIntoViewIfNeeded();
  await page.getByRole("dialog").screenshot({ path: path.join(artifacts, "long-content.png") });

  await page.evaluate(() => window.renderGroup({detail: {...window.fixtureDetail, variants: [], conversionPairs: []}}));
  await tree.getByText("Belum ada satuan dalam grup ini", {exact: true}).waitFor();
  await page.getByRole("button", { name: "Tambah satuan ke grup", exact: true }).click();
  await page.getByLabel("Nama satuan", {exact: true}).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({state: "detached"});
  assert.deepEqual(errors, []);
  process.stdout.write("PASS: read-only permissions, 8 long units, empty state, Escape close and zero browser errors.\n");
} finally {
  await browser.close();
}
