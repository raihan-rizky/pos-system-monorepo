// Run: node apps/web/features/product-stock-groups/__tests__/product-unit-browser.test.mjs
// Real production form and UI components; mutation fixtures never write store data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repo = path.resolve(web, '../..');
const { build } = require(require.resolve('esbuild', { paths: [path.join(repo, 'node_modules/.pnpm/node_modules')] }));
const { chromium } = require('@playwright/test');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const bundle = await build({
  stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import ProductFormModal from './components/inventory/ProductFormModal';
    const categories = [{ id: 'paper', name: 'Kertas' }];
    const root = createRoot(document.getElementById('root'));
    window.renderForm = () => { window.saved = undefined; window.attempts = []; window.closeCount = 0; window.failSave = false;
      root.render(<ProductFormModal key={Math.random()} isOpen onClose={() => window.closeCount++} productId={null} categories={categories} />); };
    window.renderForm();
  `, resolveDir: web, sourcefile: 'product-unit-harness.tsx', loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  alias: { '@': web, '@pos/ui': path.join(repo, 'packages/ui/src/index.ts') },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'in-memory-product-hooks', setup(builder) {
    builder.onResolve({ filter: /^@\/hooks\/(useProducts|useBrands)$/ }, args => ({ path: args.path, namespace: 'fixture-hooks' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture-hooks' }, () => ({ contents: `
      import { useState } from 'react';
      function mutation() {
        const [isPending, setPending] = useState(false);
        return { isPending, mutateAsync: async payload => { window.attempts.push(payload); setPending(true);
          await new Promise(resolve => setTimeout(resolve, 80)); setPending(false);
          if (window.failSave) throw new Error('SKU sudah digunakan. Pilih SKU yang berbeda.');
          window.saved = payload; return {...payload, id:'created'}; } };
      }
      export const useCreateProduct=mutation, useUpdateProduct=mutation, useCreateBrand=mutation;
      export const useBrands=()=>({data:[]});
    `, loader: 'js', resolveDir: web }));
  } }],
});
const sources = await Promise.all(['components/inventory/ProductFormModal.tsx', 'components/inventory/ProductUnitFields.tsx']
  .map(file => readFile(path.join(web, file), 'utf8')));
const css = await postcss([tailwind({
  content: [...sources.map(raw => ({ raw, extension: 'tsx' })), path.join(repo, 'packages/ui/src/**/*.tsx')],
  theme: { extend: { colors: { surface: require('tailwindcss/colors').slate, brand: require('tailwindcss/colors').blue } } },
})]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const artifacts = path.join(repo, 'output/playwright/product-units');
await mkdir(artifacts, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://localhost:3004/__product-unit-fixture', route => route.fulfill({ contentType:'text/html', body:'<html lang="id"><body><div id="root"></div></body></html>' }));
  await page.goto('http://localhost:3004/__product-unit-fixture');
  await page.addStyleTag({ content: css.css });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const add = page.getByRole('button', { name: 'Tambah unit lain (opsional)', exact: true });
  const save = page.getByRole('button', { name: 'Simpan Produk', exact: true });
  async function fillPrimary(unit='pcs', price='2000', stock='24') {
    await page.getByLabel('Nama Produk', { exact: true }).fill('Kertas');
    await page.getByLabel('SKU / Kode Barang', { exact: true }).fill(`KERTAS-${unit.toUpperCase()}`);
    await page.getByLabel('Harga Jual (IDR)', { exact: true }).fill(price);
    await page.getByLabel('Unit', { exact: true }).fill(unit);
    await page.getByLabel('Stok Saat Ini', { exact: true }).fill(stock);
  }
  async function reset() {
    await page.evaluate(() => window.renderForm());
    await page.waitForFunction(() => document.getElementById('nama-produk')?.value === '');
  }
  await add.waitFor();
  assert.equal(await page.locator('fieldset').count(), 0, 'single-unit entry stays simple');
  await fillPrimary();
  await save.click();
  await page.waitForFunction(() => window.closeCount === 1);
  assert.equal(Object.hasOwn(await page.evaluate(() => window.saved), 'additionalUnitVariants'), false);
  console.log('PASS: optional single-unit save.');

  await reset(); await fillPrimary(); await add.click();
  let rows = page.locator('fieldset');
  assert.equal(await rows.nth(0).getByLabel('Nama unit').evaluate(el => el === document.activeElement), true, 'new unit receives focus');
  await page.keyboard.press('Tab');
  assert.equal(await rows.nth(0).locator('select').evaluate(el=>el===document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await rows.nth(0).getByLabel('Isi dalam 1 unit tambahan').evaluate(el=>el===document.activeElement), true);
  await rows.nth(0).getByLabel('Nama unit').fill('dus');
  await rows.nth(0).getByLabel('Isi dalam 1 dus').fill('12');
  assert.equal(await rows.nth(0).getByLabel('Harga jual', { exact: true }).inputValue(), '24000');
  assert.equal(await page.getByText('Unit kecil', { exact: true }).count(), 2);
  assert.equal(await rows.nth(0).getByText('Unit besar', { exact: true }).count(), 1);
  await rows.nth(0).getByLabel('Harga jual', { exact: true }).fill('0');
  await rows.nth(0).locator('summary').focus(); await page.keyboard.press('Enter');
  await rows.nth(0).getByLabel('SKU unit', { exact: true }).fill('CUSTOM-DUS');
  await rows.nth(0).getByLabel('Barcode (opsional)').fill('HARNESS-DUS');
  await rows.nth(0).getByLabel('HPP (opsional)').fill('1500');
  await page.getByLabel('Harga Jual (IDR)', { exact: true }).fill('3000');
  await rows.nth(0).getByLabel('Isi dalam 1 dus').fill('10');
  assert.equal(await rows.nth(0).getByLabel('Harga jual', { exact: true }).inputValue(), '0');
  assert.equal(await rows.nth(0).getByLabel('SKU unit', { exact: true }).inputValue(), 'CUSTOM-DUS');
  await add.click();
  await rows.nth(1).getByLabel('Nama unit').fill('pak');
  await rows.nth(1).getByLabel('Isi dalam 1 pak').fill('6');
  const summary = await page.locator('[data-unit-stock-summary]').innerText();
  assert.ok(summary.includes('24 pcs') && summary.includes('2,4 dus') && summary.includes('4 pak'), 'preview shows each equivalent unit');
  const contrasts = await page.evaluate(() => {
    const luminance = color => color.match(/[\d.]+/g).slice(0,3).map(Number).map(value => {
      const channel=value/255; return channel<=0.04045 ? channel/12.92 : ((channel+0.055)/1.055)**2.4;
    }).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
    const badges = [...document.querySelectorAll('span')].filter(el=>['Unit kecil','Unit besar'].includes(el.textContent)).map(el=>{
      const style=getComputedStyle(el); const a=luminance(style.color), b=luminance(style.backgroundColor);
      return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
    });
    const placeholders = [...document.querySelectorAll('fieldset input[placeholder]')].map(el=>{
      const a=luminance(getComputedStyle(el,'::placeholder').color);
      return (1+0.05)/(a+0.05);
    });
    return { badges, placeholders };
  });
  assert.ok(contrasts.badges.length>=2 && contrasts.badges.every(value=>value>=4.5), 'badge text meets AA contrast');
  assert.ok(contrasts.placeholders.every(value=>value>=4.5), 'new placeholder text meets AA contrast');
  console.log('PASS: size badge contrast minimum', Math.min(...contrasts.badges).toFixed(2)+':1, placeholders', Math.min(...contrasts.placeholders).toFixed(2)+':1');
  await save.click(); await page.waitForFunction(() => window.closeCount === 1);
  const payload = await page.evaluate(() => window.saved);
  assert.equal(payload.stock, 24); assert.equal(payload.additionalUnitVariants.length, 2);
  assert.deepEqual(payload.additionalUnitVariants[0], { unit:'dus', sku:'CUSTOM-DUS', relativeQuantity:10, price:0, barcode:'HARNESS-DUS', costPrice:1500 });
  assert.equal(payload.additionalUnitVariants[1].price, 18000);
  console.log('PASS: several units, badge sizes, suggested price, keyboard disclosure, manual zero/SKU preservation.');

  await reset(); await fillPrimary('dus', '24000', '2'); await add.click();
  rows = page.locator('fieldset');
  await rows.nth(0).getByLabel('Nama unit').fill('pcs');
  await rows.nth(0).getByLabel('Ukuran dibanding dus').selectOption('smaller');
  await rows.nth(0).getByLabel('Isi dalam 1 dus').fill('12');
  assert.equal(await rows.nth(0).getByLabel('Harga jual', { exact: true }).inputValue(), '2000');
  assert.ok(await page.locator('[data-unit-stock-summary]').innerText().then(value => value.includes('2 dus') && value.includes('24 pcs')));
  assert.equal(await rows.nth(0).getByText('Unit kecil', { exact:true }).count(), 1);
  await page.setViewportSize({ width:390, height:844 });
  await rows.nth(0).scrollIntoViewIfNeeded();
  const bounds = await page.getByRole('dialog').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'modal fits mobile');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('[role="dialog"], fieldset')].every(el => el.scrollWidth <= el.clientWidth + 1)), true, 'no inner overflow');
  for (const control of [add, rows.nth(0).getByRole('button', { name:'Hapus unit tambahan 1' }), rows.nth(0).locator('summary')]) {
    assert.ok((await control.boundingBox()).height >= 44, 'new controls have 44px touch targets');
  }
  await page.screenshot({ path:path.join(artifacts, 'mobile-small-unit.png') });
  await page.setViewportSize({ width:800, height:900 });
  await rows.nth(0).scrollIntoViewIfNeeded();
  await page.screenshot({ path:path.join(artifacts, 'desktop-small-unit.png') });
  await save.click(); await page.waitForFunction(() => window.closeCount === 1);
  assert.equal((await page.evaluate(() => window.saved)).additionalUnitVariants[0].relativeQuantity, 1/12);
  console.log('PASS: smaller-unit direction, stock preview, desktop/mobile layout and touch targets.');

  await reset(); await fillPrimary(); await add.click();
  rows = page.locator('fieldset');
  await rows.nth(0).getByLabel('Nama unit').fill('pcs');
  await rows.nth(0).getByLabel('Isi dalam 1 pcs').fill('12');
  await save.click();
  assert.equal(await page.getByRole('alert').innerText(), 'Nama unit sudah digunakan. Pilih unit yang berbeda.');
  assert.equal(await page.evaluate(() => window.attempts.length), 0);
  assert.equal(await rows.nth(0).getByLabel('Nama unit').evaluate(el => el === document.activeElement), true);
  await rows.nth(0).getByLabel('Nama unit').fill('dus');
  await page.evaluate(() => window.failSave = true);
  await save.click(); await page.getByRole('alert').filter({ hasText:'SKU sudah digunakan' }).waitFor();
  assert.equal(await rows.nth(0).getByLabel('Nama unit').inputValue(), 'dus');
  assert.equal(await page.evaluate(() => window.closeCount), 0);
  await page.evaluate(() => { window.failSave = false; window.attempts = []; document.querySelector('form').requestSubmit(); document.querySelector('form').requestSubmit(); });
  await page.waitForFunction(() => window.closeCount === 1);
  assert.equal(await page.evaluate(() => window.attempts.length), 1, 'rapid submit is guarded');
  await rows.nth(0).getByRole('button', { name:'Hapus unit tambahan 1' }).click();
  await page.waitForFunction(() => document.activeElement?.id === 'add-product-unit');
  assert.equal(await rows.count(), 0);
  assert.equal(await page.getByText('Unit utama', { exact:true }).count(), 1);
  await reset(); await fillPrimary(); await add.click();
  rows = page.locator('fieldset');
  await rows.nth(0).getByLabel('Nama unit').fill('dus');
  await rows.nth(0).getByLabel('Isi dalam 1 dus').fill('12');
  await rows.nth(0).locator('summary').click();
  await rows.nth(0).getByLabel('HPP (opsional)').fill('-1');
  await rows.nth(0).locator('summary').click();
  await save.click();
  assert.equal(await page.getByRole('alert').innerText(), 'HPP harus berupa angka 0 atau lebih.');
  assert.equal(await rows.nth(0).locator('details').getAttribute('open'), '');
  assert.equal(await rows.nth(0).getByLabel('HPP (opsional)').evaluate(el=>el===document.activeElement), true);
  assert.equal(await page.evaluate(() => window.attempts.length), 0);
  await reset(); await fillPrimary(); await add.click();
  rows = page.locator('fieldset');
  await rows.nth(0).getByLabel('Nama unit').fill('pak');
  await rows.nth(0).getByLabel('Isi dalam 1 pak').fill('1');
  assert.equal(await page.getByText('Unit setara', { exact:true }).count(), 4);
  assert.equal(await page.getByText('Unit kecil', { exact:true }).count(), 0);
  assert.equal(await page.getByText('Unit besar', { exact:true }).count(), 0);
  await save.click(); await page.waitForFunction(() => window.closeCount === 1);
  assert.equal((await page.evaluate(() => window.saved)).additionalUnitVariants[0].relativeQuantity, 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.closeCount), 2);
  assert.deepEqual(errors, []);
  console.log('PASS: duplicate-unit validation, focus, server-error retention, retry, rapid-submit guard, removal, hidden HPP errors and equal-size units.');
} finally { await browser.close(); }
