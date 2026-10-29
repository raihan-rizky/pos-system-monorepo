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
  bundle: true, write: false, outdir: 'browser-memory', platform: 'browser', format: 'iife', jsx: 'automatic',
  alias: { '@': web, '@pos/ui': path.join(repo, 'packages/ui/src/index.ts') },
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
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
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
  await page.route('http://localhost:3004/__product-unit-fixture', route => route.fulfill({ contentType:'text/html', body:'<html lang="id"><body><div id="root"></div></body></html>' }));
  await page.goto('http://localhost:3004/__product-unit-fixture');
  await page.addStyleTag({ content: css.css + (bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '') });
  await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith('.js')).text });
  const add = page.getByRole('button', { name: 'Tambah unit lain (opsional)', exact: true });
  const save = page.getByRole('button', { name: 'Simpan Produk', exact: true });
  async function fillPrimary(unit='pcs', price='2000', stock='24') {
    await page.getByLabel('Nama Produk', { exact: true }).fill('Kertas');
    await page.getByLabel('SKU / Kode Barang', { exact: true }).fill(`KERTAS-${unit.toUpperCase()}`);
    await page.getByLabel('Harga Jual (IDR)', { exact: true }).fill(price);
    await page.getByLabel('Harga Modal (HPP)', { exact: true }).fill(unit === 'dus' ? '12000' : '1000');
    await page.getByLabel('Unit', { exact: true }).fill(unit);
    await page.getByLabel('Stok Saat Ini', { exact: true }).fill(stock);
  }

  await add.waitFor();
  await fillPrimary('pak', '12000', '2');
  await page.getByLabel('Harga Modal (HPP)', { exact: true }).fill('6000');
  await add.click();
  const row = page.locator('fieldset').first();
  await row.getByLabel('Nama unit').fill('pcs');
  await row.getByLabel('Ukuran dibanding pak').selectOption('smaller');
  await row.getByLabel('Isi dalam 1 pak').fill('12');
  await row.locator('summary').first().click();
  await row.getByLabel('Harga jual', { exact: true }).fill('2000');
  await row.getByLabel('Harga modal', { exact: true }).fill('800');
  const primaryPrice = page.getByLabel('Harga Jual (IDR)', { exact: true });
  const primaryCost = page.getByLabel('Harga Modal (HPP)', { exact: true });
  assert.equal(await primaryPrice.inputValue(), '12000');
  assert.equal(await primaryCost.inputValue(), '6000');
  await primaryPrice.fill('13000');
  await primaryCost.fill('6500');
  await save.click();
  await page.waitForFunction(() => window.closeCount === 1);
  const saved = await page.evaluate(() => window.saved);
  assert.equal(saved.price, 13000);
  assert.equal(saved.costPrice, 6500);
  assert.equal(saved.additionalUnitVariants[0].price, 2000);
  assert.deepEqual(errors, []);
  console.log('Manual primary unit values stay editable and match the saved payload.');
} finally {
  await browser.close();
}
