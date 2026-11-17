// Run from the repository root with Node; uses fixtures only and never writes product data.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const repo = path.resolve(web, "../..");
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");

let bundle;
try {
  bundle = await build({
    stdin: {
      resolveDir: web,
      loader: "tsx",
      contents: `
        import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { ProductClassificationPanel } from './features/product-classification/components/ProductClassificationPanel';

        const unit = (id, name, unit, isActive, legacyCategoryName, catalogSubcategory = null) =>
          ({ id, name, unit, isActive, legacyCategoryName, catalogSubcategory, imageUrl: null });
        const groups = [
          { id: 'pulpen', name: 'Pulpen', imageUrl: null, units: [
            unit('pcs', 'Pulpen pcs', 'pcs', true, 'ATK'),
            unit('pak', 'Pulpen pak', 'pak', false, 'ATK')
          ] },
          { id: 'tinta', name: 'Tinta', imageUrl: null, units: [unit('tinta', 'Tinta botol', 'botol', true, 'BOT')] },
          { id: 'kertas', name: 'Kertas', imageUrl: null, units: [unit('kertas', 'Kertas lembar', 'lembar', true, 'PLANO')] }
        ];
        const subcategories = [
          { id: 'atk', group: 'ATK', name: 'ATK', legacyCategoryId: 'old-atk' },
          { id: 'print', group: 'PERCETAKAN', name: 'PRINT', legacyCategoryId: null },
          { id: 'stempel', group: 'PERCETAKAN', name: 'STEMPEL', legacyCategoryId: null },
          { id: 'plat', group: 'PERCETAKAN', name: 'PLAT', legacyCategoryId: null },
          { id: 'cetak', group: 'PERCETAKAN', name: 'CETAK', legacyCategoryId: null },
          { id: 'spanduk', group: 'PERCETAKAN', name: 'SPANDUK', legacyCategoryId: null }
        ];
        window.expiry = 60000;
        window.unknownImpact = false;
        window.zeroImpact = false;
        window.manyImpacts = false;
        window.applied = [];
        function Harness() {
          const [selected, setSelected] = useState(new Set());
          const [search, setSearch] = useState('');
          const [page, setPage] = useState(1);
          const [legacyCategory, setLegacyCategory] = useState('');
          const [classificationStatus, setClassificationStatus] = useState('all');
          const [filterMainCategory, setFilterMainCategory] = useState('');
          const [filterSubcategoryId, setFilterSubcategoryId] = useState('');
          const [preview, setPreview] = useState(null);
          window.selection = [...selected].sort();
          window.setSelection = ids => setSelected(new Set(ids));
          const filtered = groups.filter(group => group.name.toLowerCase().includes(search.toLowerCase()) ||
            group.units.some(item => item.name.toLowerCase().includes(search.toLowerCase())));
          const pageCount = Math.max(1, Math.ceil(filtered.length / 2));
          function inspect(targetId) {
            const target = subcategories.find(item => item.id === targetId);
            const units = groups.flatMap(group => group.units).filter(item => selected.has(item.id));
            const unchanged = units.filter(item => item.catalogSubcategory?.id === targetId).length;
            setPreview({
              token: 'token-' + targetId,
              expiresAt: Date.now() + window.expiry,
              target,
              units,
              totals: { selected: units.length, moving: units.length - unchanged, unchanged,
                active: units.filter(item => item.isActive).length, inactive: units.filter(item => !item.isActive).length },
              pricingImpact: window.unknownImpact ? null : window.zeroImpact ? { changed: 0, examples: [] } : window.manyImpacts
                ? { changed: 12, examples: Array.from({length:12}, (_,index)=>({ unitId:'id-'+index, unitName:'Satuan '+(index+1), customerType:'UMUM', before:900, after:900,
                    beforeRule:{id:'old',scope:'CATEGORY',label:'Kategori lama BOT · UMUM diskon Rp 100'}, afterRule:{id:'new',scope:'SUBCATEGORY',label:'PERCETAKAN / PRINT · UMUM diskon Rp 100'} })) }
                : { changed: 1, examples: [{ unitId:'pcs', unitName: 'Pulpen pcs', customerType: 'AGEN', before: 1000, after: 1200,
                    beforeRule:{id:'old',scope:'CATEGORY',label:'Kategori lama BOT'}, afterRule:{id:'new',scope:'SUBCATEGORY',label:'PERCETAKAN / PRINT'} }] }
            });
          }
          return <ProductClassificationPanel
            groups={filtered.slice((page - 1) * 2, page * 2)} subcategories={subcategories}
            selectedUnitIds={selected} onSelectionChange={setSelected}
            search={search} onSearchChange={value => { setSearch(value); setPage(1); }}
            legacyCategories={[{ id: 'old-atk', name: 'ATK' }]}
            legacyCategory={legacyCategory} onLegacyCategoryChange={setLegacyCategory}
            classificationStatus={classificationStatus} onClassificationStatusChange={setClassificationStatus}
            filterMainCategory={filterMainCategory} onFilterMainCategoryChange={setFilterMainCategory}
            filterSubcategoryId={filterSubcategoryId} onFilterSubcategoryChange={setFilterSubcategoryId}
            page={page} pageCount={pageCount} onPageChange={setPage}
            preview={preview} onPreview={inspect} onPreviewClose={() => setPreview(null)}
            onApply={token => { window.applied.push(token); setPreview(null); }} />;
        }
        createRoot(document.getElementById('root')).render(<Harness />);
      `,
    },
    bundle: true, write: false, outdir: "out", platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
} catch (error) {
  assert.fail(`Komponen klasifikasi harus dapat dirender untuk pengujian perilaku: ${error.message}`);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setContent('<html lang="id"><body><div id="root"></div></body></html>');
  const css = bundle.outputFiles.find(file => file.path.endsWith(".css"));
  if (css) await page.addStyleTag({ content: css.text });
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });

  // Selecting a parent includes hidden and inactive units. Removing one child makes it partial.
  const pulpen = page.getByRole("checkbox", { name: "Pilih semua satuan Pulpen" });
  await pulpen.focus();
  await page.keyboard.press("Space");
  assert.deepEqual(await page.evaluate(() => window.selection), ["pak", "pcs"]);
  await page.getByRole("button", { name: "Tampilkan satuan Pulpen" }).click();
  await page.getByText("Tidak aktif", { exact: true }).waitFor();
  await page.getByRole("checkbox", { name: "Pilih Pulpen pak" }).uncheck();
  assert.equal(await pulpen.evaluate(element => element.indeterminate), true);
  assert.deepEqual(await page.evaluate(() => window.selection), ["pcs"]);

  // Searching and changing pages retain selection; select-all only changes this page's groups.
  await page.getByLabel("Cari produk").fill("Tinta");
  await page.getByRole("checkbox", { name: "Pilih semua satuan Tinta" }).check();
  await page.getByLabel("Cari produk").fill("");
  await page.getByRole("button", { name: "Halaman berikutnya" }).click();
  await page.getByRole("checkbox", { name: "Pilih semua satuan Kertas" }).check();
  await page.getByRole("button", { name: "Halaman sebelumnya" }).click();
  assert.deepEqual(await page.evaluate(() => window.selection), ["kertas", "pcs", "tinta"]);
  const visible = page.getByRole("checkbox", { name: "Pilih semua satuan pada halaman ini" });
  await visible.check();
  assert.deepEqual(await page.evaluate(() => window.selection), ["kertas", "pak", "pcs", "tinta"]);
  await visible.uncheck();
  assert.deepEqual(await page.evaluate(() => window.selection), ["kertas"]);

  await page.getByRole("button", { name: "Batal pilih semua" }).click();
  await pulpen.check();
  await page.getByRole("radio", { name: "PERCETAKAN" }).check();
  const subcategoryChoices = page.getByRole("group", { name: /Pilih subkategori/ });
  for (const name of ["PRINT", "STEMPEL", "PLAT", "CETAK", "SPANDUK"]) assert.equal(await subcategoryChoices.getByRole("radio", { name }).count(), 1);
  await page.getByRole("radio", { name: "PRINT" }).check();
  const review = page.getByRole("button", { name: "Tinjau pemindahan" });
  if (process.env.CLASSIFICATION_DESKTOP_SCREENSHOT) await page.screenshot({ path: process.env.CLASSIFICATION_DESKTOP_SCREENSHOT, fullPage: true });
  await review.click();
  let dialog = page.getByRole("dialog", { name: "Tinjau pemindahan" });
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /2 satuan dipilih/);
  assert.match(await dialog.innerText(), /1 aktif/);
  assert.match(await dialog.innerText(), /1 tidak aktif/);
  assert.match(await dialog.innerText(), /Pulpen pak/);
  assert.match(await dialog.innerText(), /AGEN/);
  if (process.env.CLASSIFICATION_REVIEW_SCREENSHOT) await page.screenshot({ path: process.env.CLASSIFICATION_REVIEW_SCREENSHOT });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await review.evaluate(element => element === document.activeElement), true);

  // Equal amounts still disclose the changed rules; all impacts remain reachable.
  await page.evaluate(() => { window.manyImpacts = true; });
  await review.click();
  dialog = page.getByRole("dialog", { name: "Tinjau pemindahan" });
  await dialog.getByText(/Kategori lama BOT · UMUM diskon Rp 100/).first().waitFor();
  assert.match(await dialog.innerText(), /PERCETAKAN \/ PRINT · UMUM diskon Rp 100/);
  await dialog.getByRole("button", { name: "Dampak berikutnya" }).click();
  assert.match(await dialog.innerText(), /Satuan 12/);
  assert.match(await dialog.innerText(), /11–12 dari 12/);
  await dialog.getByRole("button", { name: "Kembali" }).click();
  await page.evaluate(() => { window.manyImpacts = false; });

  // A selection change invalidates the visible preview; an expired token can never be applied.
  await review.click();
  dialog = page.getByRole("dialog", { name: "Tinjau pemindahan" });
  await dialog.waitFor();
  await page.evaluate(() => window.setSelection(["pcs"]));
  assert.equal(await dialog.getByRole("button", { name: "Pindahkan satuan" }).isDisabled(), true);
  assert.match(await dialog.innerText(), /berubah.*tinjau ulang/i);
  await dialog.getByRole("button", { name: "Kembali" }).click();
  await page.evaluate(() => { window.setSelection(["pcs", "pak"]); window.expiry = 350; });
  await review.click();
  dialog = page.getByRole("dialog", { name: "Tinjau pemindahan" });
  await dialog.getByText(/Pratinjau kedaluwarsa/).waitFor();
  assert.equal(await dialog.getByRole("button", { name: "Pindahkan satuan" }).isDisabled(), true);
  await dialog.getByRole("button", { name: "Kembali" }).click();
  await page.evaluate(() => { window.expiry = 60000; window.unknownImpact = true; });
  await review.click();
  dialog = page.getByRole("dialog", { name: "Tinjau pemindahan" });
  await dialog.getByText(/dampak harga.*belum diketahui/i).waitFor();
  assert.equal(await dialog.getByRole("button", { name: "Pindahkan satuan" }).isDisabled(), true);
  await dialog.getByRole("button", { name: "Kembali" }).click();
  await page.evaluate(() => { window.unknownImpact = false; window.zeroImpact = true; });
  await review.click();
  dialog = page.getByRole("dialog", { name: "Tinjau pemindahan" });
  await dialog.getByText(/Tidak ada perubahan harga pelanggan yang terdeteksi/).waitFor();
  await dialog.getByRole("button", { name: "Kembali" }).click();
  await page.evaluate(() => { window.zeroImpact = false; });
  await review.click();
  dialog = page.getByRole("dialog", { name: "Tinjau pemindahan" });
  await dialog.getByRole("button", { name: "Pindahkan satuan" }).click();
  assert.deepEqual(await page.evaluate(() => window.applied), ["token-print"]);

  // Mobile view keeps the page within the viewport and provides keyboard focus to the tray.
  await page.setViewportSize({ width: 375, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const mobileButton = await page.getByRole("button", { name: "Atur tujuan" }).boundingBox();
  assert.ok(mobileButton && mobileButton.y + mobileButton.height <= 736, "the mobile action clears the app's 64px bottom navigation");
  if (process.env.CLASSIFICATION_MOBILE_SCREENSHOT) await page.screenshot({ path: process.env.CLASSIFICATION_MOBILE_SCREENSHOT, fullPage: true });
  await page.getByRole("button", { name: "Atur tujuan" }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Baki pemindahan");
  await page.evaluate(() => { window.manyImpacts = true; });
  await review.click();
  dialog = page.getByRole("dialog", { name: "Tinjau pemindahan" });
  const nextImpact = dialog.getByRole("button", { name: "Dampak berikutnya" });
  await nextImpact.focus();
  await page.keyboard.press("Enter");
  assert.match(await dialog.innerText(), /Satuan 12/);
  assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
  await dialog.getByRole("button", { name: "Kembali" }).click();
  assert.deepEqual(errors, []);
  process.stdout.write("PASS classification UI: group and partial selection, persistence, destination, preview, expiry, keyboard and mobile\n");
} finally {
  await browser.close();
}
