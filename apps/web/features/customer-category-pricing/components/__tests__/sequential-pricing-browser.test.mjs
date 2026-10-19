// Run with Node. Real form components; all catalog data and saves stay in memory.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const repo = path.resolve(web, '../..');
const require = createRequire(path.join(web, 'package.json'));
const { build } = require(require.resolve('esbuild', { paths: [path.join(repo, 'node_modules/.pnpm/node_modules')] }));
const { chromium } = require('@playwright/test');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const bundle = await build({
  stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {PricingRuleForm} from './features/customer-category-pricing/components/PricingRuleForm';
    const root=createRoot(document.getElementById('root'));
    window.renderPricing=initialRule=>{ window.saved=undefined;
      root.render(<PricingRuleForm key={Math.random()} initialRule={initialRule} onSave={async input=>{window.saved=input}} onClose={()=>{}} isSaving={false}/>);
    }; window.renderPricing();
  `, resolveDir: web, loader: 'tsx', sourcefile: 'sequential-pricing-harness.tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  alias: { '@': web }, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'pricing-fixtures', setup(builder) {
    builder.onResolve({ filter: /^@\/hooks\/(useProducts|useBrands|useCustomerCategoryPricingRules)$/ }, args => ({ path: args.path, namespace: 'fixtures' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixtures' }, () => ({ contents: `
      export const useCategories=()=>({data:[{id:'paper',name:'Kertas'}]});
      export const useBrands=()=>({data:[]});
      export const useCreateBrand=()=>({isPending:false});
      export const useCustomerCategoryPricingRules=()=>({data:[]});
      export const usePricingUnitOptions=()=>({data:['pcs','dus','pak'],isPending:false,isError:false});
      export const usePricingScopeOptions=()=>({data:{products:window.previewProducts??[{id:'box',name:'Contoh dus',unit:'dus',price:16200,costPrice:12000,baseCostPrice:1000,baseCostUnit:'pcs',brandId:null}]},isPending:false,isFetching:false,isError:false});
    `, loader: 'js' }));
  } }],
});
const raw = await readFile(path.join(web, 'features/customer-category-pricing/components/PricingRuleForm.tsx'), 'utf8');
const css = await postcss([tailwind({ content: [{ raw, extension: 'tsx' }], theme: { extend: { colors: { brand: require('tailwindcss/colors').blue } } } })])
  .process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined });
const artifacts = path.join(repo, 'output/playwright/sequential-pricing');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://localhost:3004/__pricing-fixture', route => route.fulfill({ contentType: 'text/html', body: '<html lang="id"><body style="padding:16px"><div id="root"></div></body></html>' }));
  await page.goto('http://localhost:3004/__pricing-fixture');
  await page.addStyleTag({ content: css.css });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByLabel('Kategori', { exact: false }).selectOption('paper');
  await page.getByLabel('Satuan', { exact: true }).selectOption('dus');
  await page.getByRole('radio', { name: /HPP masing-masing satuan \+ persen/ }).check();
  await page.getByRole('spinbutton', { name: 'Tambahan (%) *', exact: true }).fill('10');
  const discount = page.getByLabel('Potongan setelah tambahan (%)', { exact: false });
  await discount.fill('101');
  await page.getByRole('button', { name: 'Simpan aturan', exact: true }).click();
  assert.equal(await discount.getAttribute('aria-invalid'), 'true');
  assert.equal(await discount.evaluate(el => el === document.activeElement), true);
  assert.equal(await page.evaluate(() => window.saved), undefined);
  await discount.fill('5');
  assert.ok((await page.getByRole('region', { name: 'Pratinjau harga' }).innerText()).includes('12.540'));
  await page.getByRole('button', { name: 'Simpan aturan', exact: true }).click();
  await page.waitForFunction(() => window.saved?.discountPercent === 5);
  const saved = await page.evaluate(() => window.saved);
  assert.equal(saved.value, 10);
  assert.equal(saved.unit, 'dus');
  await page.evaluate(rule => window.renderPricing(rule), { ...saved, id: 'saved-rule' });
  await page.waitForFunction(() => document.getElementById('pricing-discountPercent')?.value === '5');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await discount.fill('20');
  assert.ok((await page.getByRole('region', { name: 'Pratinjau harga' }).innerText()).includes('10.560'));
  await page.screenshot({ path: path.join(artifacts, 'mobile-sequential-pricing.png'), fullPage: true });
  await page.getByRole('button', { name: 'Simpan aturan', exact: true }).click();
  await page.waitForFunction(() => window.saved?.discountPercent === 20);
  await page.getByRole('radio', { name: /HPP satuan terkecil \+ rupiah/ }).check();
  await page.getByLabel('Tambahan (Rp)', { exact: false }).fill('500');
  await page.getByRole('button', { name: 'Simpan aturan', exact: true }).click();
  await page.waitForFunction(() => window.saved?.mode === 'COST_PLUS_FLAT');
  assert.equal(Object.hasOwn(await page.evaluate(() => window.saved), 'discountPercent'), false);
  const preview = page.getByRole('region', { name: 'Pratinjau harga' });
  await page.evaluate(() => {
    window.previewProducts = [
      {id:'dus',name:'Contoh barang · dus',unit:'dus',price:12000,costPrice:7600,baseCostPrice:7600,baseCostUnit:'dus',brandId:null},
      {id:'pak',name:'Contoh barang · pak',unit:'pak',price:108000,costPrice:76000,baseCostPrice:7600,baseCostUnit:'dus',brandId:null},
    ];
    window.renderPricing({categoryId:'paper',unit:null,customerType:'ALL',mode:'COST_PLUS_PERCENT',value:35,isActive:true});
  });
  await preview.getByText('Harga di bawah HPP satuan.', { exact: false }).waitFor();
  assert.equal(await preview.locator('dl').count(), 2);
  assert.ok((await preview.innerText()).includes('-640,74%'));
  const loss = preview.getByRole('listitem').filter({hasText:'Contoh barang · pak'});
  assert.ok((await loss.locator('dd').nth(1).getAttribute('class')).includes('text-red-700'));
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `horizontal overflow at ${width}px`);
  }
  const screenshots = path.join(web, 'public/images/changelog');
  await mkdir(screenshots, { recursive: true });
  await preview.screenshot({ path: path.join(screenshots, 'pratinjau-harga-khusus-hpp.png') });
  await page.getByRole('radio', { name: /HPP masing-masing satuan \+ persen/ }).check();
  await page.getByLabel('Potongan setelah tambahan (%)', { exact: false }).fill('0');
  await page.waitForFunction(() => document.querySelector('[aria-label="Pratinjau harga"]').textContent.includes('102.600'));
  assert.equal(await preview.getByText('Harga di bawah HPP satuan.', {exact:false}).count(), 0);
  assert.equal((await preview.innerText()).match(/25,93%/g)?.length, 2);
  await page.getByRole('button', { name: 'Simpan aturan', exact: true }).click();
  await page.waitForFunction(() => window.saved?.mode === 'UNIT_COST_PLUS_PERCENT_DISCOUNT');
  assert.equal((await page.evaluate(() => window.saved)).unit, null);
  assert.equal((await page.evaluate(() => window.saved)).discountPercent, 0);
  await page.getByRole('button', {name:'Simpan aturan',exact:true}).focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.getByLabel('Kategori', {exact:false}).evaluate(el=>el===document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.getByRole('button', {name:'Simpan aturan',exact:true}).evaluate(el=>el===document.activeElement), true);
  assert.deepEqual(errors, []);
  console.log('PASS: sequential preview, invalid percentage focus, create/edit payloads, cost basis per unit, loss warning, markup versus margin, keyboard access, and layouts at 320/390/1280px.');
} finally { await browser.close(); }
