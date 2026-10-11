// Run directly: node apps/web/features/pos-product-variants/__tests__/product-description-browser.test.mjs
// Uses real React components with in-memory mutation hooks; never writes store data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repo = path.resolve(web, '../..');
const { build } = require(require.resolve('esbuild', { paths: [path.join(repo, 'node_modules/.pnpm/node_modules')] }));
const { chromium } = require('@playwright/test');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const description = 'Kertas A4 80 gsm, isi 500 lembar.\nCocok untuk printer dan fotokopi. Simpan di tempat kering. '.repeat(4).trim();
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProductDescriptionTooltip } from './features/pos-product-variants/components/ProductDescriptionTooltip';
import ProductFormModal from './components/inventory/ProductFormModal';
import { PosProductQuickEditModal } from './components/EditProductModal';
const categories = [{ id: 'paper', name: 'Kertas' }];
const product = { id: 'paper-1', name: 'Kertas A4', sku: 'A4', description: 'Deskripsi lama', price: 10000, costPrice: 7000, stock: 10, minStock: 5, unit: 'rim', categoryId: 'paper', category: categories[0] };
function Demo({mode}) {
  const [count, setCount] = React.useState(0);
  if (mode === 'create' || mode === 'edit') return <ProductFormModal isOpen onClose={()=>{}} productId={mode === 'edit' ? product.id : null} categories={categories} initialData={mode === 'edit' ? product : null} />;
  if (mode === 'quick' || mode === 'quick-legacy') return <PosProductQuickEditModal open item={mode === 'quick-legacy' ? {...product, description: undefined} : product} categories={categories} brands={[]} onClose={()=>{}} onSave={async payload=>{window.saved = payload}} />;
  return <><button id="outside">Di luar kartu</button><output id="cart-count">{count}</output><div id="card" style={{position:'fixed',right:12,bottom:12,width:160,overflow:'hidden',padding:12,border:'1px solid #cbd5e1',background:'white'}} onClick={()=>setCount(n=>n+1)}><h3>Kertas A4</h3><ProductDescriptionTooltip description={mode === 'empty' ? '  ' : ${JSON.stringify(description)}} /></div></>;
}
const root = createRoot(document.getElementById('root'));
window.renderDemo = mode => root.render(<Demo key={mode} mode={mode}/>);
window.renderDemo('tooltip');
`;
const bundle = await build({
  stdin: { contents: entry, resolveDir: web, sourcefile: 'product-description-harness.tsx', loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  alias: { '@': web, '@pos/ui': path.join(repo, 'packages/ui/src/index.ts') },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'in-memory-product-hooks', setup(builder) {
    builder.onResolve({ filter: /^@\/hooks\/(useProducts|useBrands)$/ }, args => ({ path: args.path, namespace: 'test-hooks' }));
    builder.onResolve({ filter: /^@\/lib\/logger$/ }, args => ({ path: args.path, namespace: 'test-hooks' }));
    builder.onLoad({ filter: /.*/, namespace: 'test-hooks' }, () => ({ contents: `
      const mutation = () => ({isPending:false, mutateAsync: async payload => {window.saved = payload; return {...payload, id:'paper-1'}}});
      export const useCreateProduct=mutation, useUpdateProduct=mutation, useCreateBrand=mutation;
      export const useCategories=()=>({data:[{id:'paper',name:'Kertas'}]}), useBrands=()=>({data:[]});
      export const getLogger=()=>({error:()=>{}});
    `, loader: 'js' }));
  } }],
});
const sources = await Promise.all([
  'features/pos-product-variants/components/ProductDescriptionTooltip.tsx',
  'components/inventory/ProductFormModal.tsx', 'components/EditProductModal.tsx',
].map(file => readFile(path.join(web, file), 'utf8')));
const css = await postcss([tailwind({
  content: [...sources.map(raw => ({ raw, extension: 'tsx' })), path.join(repo, 'packages/ui/src/**/*.tsx')],
  theme: { extend: { colors: { surface: require('tailwindcss/colors').slate, brand: require('tailwindcss/colors').blue } } },
})]).process('@tailwind base; @tailwind utilities;', { from: undefined });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<html lang="id"><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: css.css });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => window.renderDemo('quick-legacy'));
  await page.getByLabel('Deskripsi produk', { exact: false }).waitFor();
  await page.waitForFunction(() => document.querySelector('input')?.value === 'Kertas A4');
  await page.getByRole('button', { name: 'Simpan Perubahan', exact: true }).click();
  await page.waitForFunction(() => window.saved !== undefined);
  assert.equal(await page.evaluate(() => Object.hasOwn(window.saved, 'description')), false, 'editing legacy cart metadata must not silently clear an unknown description');
  console.log('PASS: legacy cart metadata preserves unknown description.');
  await page.evaluate(() => window.renderDemo('tooltip'));
  const trigger = page.getByRole('button', { name: 'Deskripsi produk', exact: true });
  await trigger.waitFor();
  const clamp = await trigger.locator('span').evaluate(el => ({ height: el.clientHeight, line: parseFloat(getComputedStyle(el).lineHeight) }));
  assert.ok(clamp.height <= clamp.line * 2 + 1, 'description is limited to two lines');
  await trigger.hover();
  const tooltip = page.getByRole('tooltip');
  await tooltip.waitFor({ state: 'visible' });
  assert.equal(await tooltip.innerText(), description);
  assert.equal(await tooltip.evaluate(el => el.parentElement === document.body), true, 'portal escapes card clipping');
  const bounds = await tooltip.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 800 && bounds.y >= 0 && bounds.y + bounds.height <= 600, 'tooltip fits viewport');
  await tooltip.hover();
  await page.waitForTimeout(200);
  assert.equal(await tooltip.isVisible(), true, 'tooltip remains readable when hovered');
  await page.keyboard.press('Escape');
  assert.equal(await tooltip.count(), 0);
  await trigger.hover();
  await tooltip.waitFor({ state: 'visible' });
  await page.mouse.move(0, 0);
  await tooltip.waitFor({ state: 'detached', timeout: 2000 });
  assert.equal(await tooltip.count(), 0, 'hover dismissal still works after Escape');

  console.log('PASS: tooltip hover, text selection, keyboard, dismissal and click isolation.');
  await trigger.focus();
  await tooltip.waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  assert.equal(await tooltip.count(), 0, 'Escape dismisses without moving focus');
  await page.locator('#outside').click();
  await trigger.click();
  await tooltip.waitFor({ state: 'visible' });
  assert.equal(await page.locator('#cart-count').innerText(), '0', 'description click does not add to cart');
  await tooltip.click();
  assert.equal(await tooltip.isVisible(), true, 'tooltip remains open while its text is selected');
  assert.equal(await page.locator('#cart-count').innerText(), '0', 'tooltip click does not add to cart');
  await page.locator('#outside').click();
  assert.equal(await tooltip.count(), 0, 'outside click dismisses');
  await page.evaluate(() => window.renderDemo('empty'));
  await trigger.waitFor({ state: 'detached' });
  assert.equal(await tooltip.count(), 0);

  await page.evaluate(() => window.renderDemo('create'));
  const field = page.getByLabel('Deskripsi produk', { exact: false });
  await field.waitFor();
  await page.getByLabel('Nama Produk', { exact: true }).fill('Kertas A4');
  await page.getByLabel('SKU / Kode Barang', { exact: true }).fill('A4');
  await page.getByLabel('Harga Jual (IDR)', { exact: true }).fill('10000');
  await field.fill('  Deskripsi baru  ');
  await page.getByRole('button', { name: /Simpan Produk/ }).click();
  await page.waitForFunction(() => window.saved?.description === 'Deskripsi baru');
  assert.equal(await page.evaluate(() => window.saved.description), 'Deskripsi baru');

  await page.evaluate(() => window.renderDemo('edit'));
  await field.waitFor();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Deskripsi lama');
  await field.fill('');
  await page.getByRole('button', { name: /Simpan Produk/ }).click();
  await page.waitForFunction(() => window.saved?.description === null);
  assert.equal(await page.evaluate(() => window.saved.description), null);

  await page.evaluate(() => window.renderDemo('quick'));
  await field.waitFor();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Deskripsi lama');
  await field.fill('Deskripsi grup');
  await page.getByRole('button', { name: 'Simpan Perubahan', exact: true }).click();
  await page.waitForFunction(() => window.saved?.description === 'Deskripsi grup');
  assert.equal(await page.evaluate(() => window.saved.description), 'Deskripsi grup');
  console.log('PASS: create, edit, clear and quick-edit descriptions.');

  await page.evaluate(() => window.renderDemo('tooltip'));
  await page.setViewportSize({ width: 320, height: 420 });
  await trigger.hover();
  await tooltip.waitFor({ state: 'visible' });
  const mobileBounds = await tooltip.boundingBox();
  assert.ok(mobileBounds.x >= 0 && mobileBounds.x + mobileBounds.width <= 320 && mobileBounds.y >= 0 && mobileBounds.y + mobileBounds.height <= 420, 'tooltip fits narrow viewport');
  if (process.argv[2]) await page.screenshot({ path: process.argv[2] });

  const touchPage = await browser.newPage({ viewport: { width: 320, height: 420 }, hasTouch: true });
  touchPage.on('pageerror', error => errors.push(error.message));
  await touchPage.setContent('<html lang="id"><body><div id="root"></div></body></html>');
  await touchPage.addStyleTag({ content: css.css });
  await touchPage.addScriptTag({ content: bundle.outputFiles[0].text });
  const touchTrigger = touchPage.getByRole('button', { name: 'Deskripsi produk', exact: true });
  await touchTrigger.tap();
  await touchPage.getByRole('tooltip').waitFor({ state: 'visible' });
  await touchTrigger.tap();
  assert.equal(await touchPage.getByRole('tooltip').count(), 0, 'second tap closes balloon');
  await touchTrigger.tap();
  await touchPage.getByRole('tooltip').waitFor({ state: 'visible' });
  await touchPage.locator('#outside').tap();
  assert.equal(await touchPage.getByRole('tooltip').count(), 0, 'outside tap closes balloon');
  assert.equal(await touchPage.locator('#cart-count').innerText(), '0', 'touch does not add to cart');
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log('PASS: two-line clamp, full text, portal, hover persistence, keyboard/Escape, click isolation, outside dismiss, empty state, create/edit/clear/quick-edit, narrow viewport and touch.');
} finally {
  await browser.close();
}
