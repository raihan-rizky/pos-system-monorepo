import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bundleReactHarness, web } from "../../product-stock-groups/__tests__/browser-harness.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const bundle = await bundleReactHarness(`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {ProductCard} from './features/pos-product-variants/components/ProductCard';
import {PriceRoundingSettingsView} from './features/product-price-rounding/components/PriceRoundingSettingsTab';
const initial={enabled:true,increment:500,threshold:50};
const product={id:'contoh',name:'Produk contoh',description:'Data contoh untuk pratinjau pembulatan.',sku:'CONTOH-PCS',price:4050,costPrice:2000,stock:10,minStock:2,unit:'pcs',isActive:true,imageUrl:null,category:{id:'contoh',name:'Produk contoh',color:'#2563eb',icon:null},hargaAgen:null,hargaDinas:null};
window.added=0;window.saved=0;
function Harness(){const[settings,setSettings]=useState(initial);const[success,setSuccess]=useState(false);const policy=settings.increment>0 && settings.threshold>=0 && settings.threshold<=settings.increment ? settings : initial;return <main className="mx-auto max-w-5xl p-4 sm:p-8"><header className="mb-6"><p className="text-xs font-semibold text-brand-600">DATA CONTOH</p><h1 className="text-2xl font-bold text-surface-900">Pembulatan harga jual</h1><p className="mt-2 text-sm text-surface-600">Harga asal tetap tersimpan. Harga jual berlaku mengikuti pengaturan toko.</p></header><div className="grid items-start gap-6 md:grid-cols-2"><section className="rounded-2xl border border-surface-200 bg-white p-5"><PriceRoundingSettingsView settings={settings} canUpdate isLoading={false} isUpdating={false} error={null} success={success} onChange={value=>{setSettings(value);setSuccess(false)}} onSubmit={()=>{window.saved++;setSuccess(true)}}/></section><section aria-label="Kartu produk contoh" className="max-w-sm"><ProductCard product={product} roundingSettings={policy} onAddToCart={()=>window.added++}/></section></div></main>};
createRoot(document.getElementById('root')).render(<Harness/>);
`, ["features/product-price-rounding/components/PriceRoundingBadge.tsx","features/product-price-rounding/components/PriceRoundingSettingsTab.tsx","features/pos-product-variants/components/ProductCard.tsx","features/product-price-rounding/__tests__/rounding-browser.test.mjs"]);
console.log('Fixture bundled');
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
 for (const width of [1280,375]) {
  const page = await browser.newPage({viewport:{width,height:1050},isMobile:width===375,hasTouch:width===375});
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER ERROR',e.message)});
  await page.route('http://localhost:3015/**',route=>new URL(route.request().url()).pathname.startsWith('/_next/image') ? route.fulfill({path:path.join(web,'public/images/atk_default.png')}) : route.fulfill({contentType:'text/html',body:'<html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#f8fafc"><div id="root"></div></body></html>'}));
  await page.addInitScript(()=>{window.process={env:{}}});
  await page.goto('http://localhost:3015/rounding-fixture');await page.addStyleTag({content:bundle.css});await page.addScriptTag({content:bundle.script});
  const card=page.getByRole('region',{name:'Kartu produk contoh'});
  await card.getByText(/Rp\s4\.500/).first().waitFor();
  const badge=card.locator('summary').first();
  assert.equal(await card.locator('details').first().getAttribute('open'),null);
  if(width===375) await badge.tap();else await badge.click();
  assert.equal(await card.locator('details').first().evaluate(el=>el.open),true);
  assert.equal(await page.evaluate(()=>window.added),0);
  await badge.focus();await page.keyboard.press('Enter');
  assert.equal(await card.locator('details').first().evaluate(el=>el.open),false);
  await page.keyboard.press('Space');
  assert.equal(await card.locator('details').first().evaluate(el=>el.open),true);
  assert.equal(await page.evaluate(()=>window.added),0);
  assert.match(await card.locator('details').first().innerText(),/4\.050/);
  assert.match(await card.locator('details').first().innerText(),/\+Rp.*450/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  if(width===1280){await mkdir(path.join(web,'public/images/changelog'),{recursive:true});await page.locator('main').screenshot({path:path.join(web,'public/images/changelog/pembulatan-harga-jual.png')});}
  await page.getByRole('switch').click();
  await card.getByText(/Rp\s4\.050/).first().waitFor();
  assert.equal(await card.locator('summary').count(),0);
  await page.getByRole('switch').click();
  const increment=page.locator('#rounding-increment');await increment.fill('1000');
  await card.getByText(/Rp\s5\.000/).first().waitFor();
  await page.locator('#rounding-threshold').fill('1000');
  await card.getByText(/Rp\s4\.000/).first().waitFor();
  await page.getByRole('button',{name:/Simpan/}).click();assert.equal(await page.evaluate(()=>window.saved),1);
  await increment.fill('0');assert.equal(await page.getByRole('button',{name:/Simpan/}).isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: click/touch, Enter/Space, no add-to-cart, current policy, validation, save, no overflow`);
  await page.close();
 }
} finally {await browser.close();}
