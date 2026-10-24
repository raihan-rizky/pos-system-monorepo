import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { bundleReactHarness } from "./browser-harness.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const bundle = await bundleReactHarness(`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import PriceUpdateModal,{PosPriceQuickEditModal} from './components/inventory/PriceUpdateModal';import {projectGroupPricing} from './features/product-stock-groups/automatic-pricing';
window.project=projectGroupPricing;window.saved=[];window.closeCount=0;const initial={id:'pak',productId:'pak',cartLineId:'pak-line',lineType:'PRODUCT',name:'Snowman',sku:'SN-PAK',price:32400,catalogPrice:32400,costPrice:24000,stock:10,quantity:1,unit:'pak',unitMultiplierToBase:12,stockGroupId:'snowman',stockGroup:{id:'snowman',baseUnit:'pcs'},category:{id:'paper',name:'Alat tulis'},categoryId:'paper',categoryName:'Alat tulis',hargaDinas:null,hargaAgen:null,isActive:true};const client=new QueryClient({defaultOptions:{queries:{retry:false}}});function Harness(){const[p,setP]=useState(initial);window.refresh=()=>setP({...initial,price:37800,catalogPrice:37800,costPrice:25000});return <QueryClientProvider client={client}>{location.search.includes('pos')?<PosPriceQuickEditModal open item={p} onClose={()=>window.closeCount++} onSave={input=>window.saved.push(input)}/>:<PriceUpdateModal isOpen product={p} onClose={()=>window.closeCount++} onViewHistory={()=>{}}/>}</QueryClientProvider>}createRoot(document.getElementById('root')).render(<Harness/>);`, ["components/inventory/PriceUpdateModal.tsx", "features/product-stock-groups/components/ProductPricingAction.tsx", "features/product-stock-groups/components/GroupPricingPanel.tsx", "features/product-stock-groups/components/StockGroupWorkspace.tsx"]);
const review = { price: [], costPrice: [] };
const variants = [
  { id: "pcs", name: "Snowman", sku: "SN-PCS", unit: "pcs", price: 3000, costPrice: 2000, stock: 120, unitMultiplierToBase: 1, conversionNeedsReview: false, isActive: true },
  { id: "pak", name: "Snowman", sku: "SN-PAK", unit: "pak", price: 32400, costPrice: 24000, stock: 10, unitMultiplierToBase: 12, conversionNeedsReview: false, isActive: true },
];
const initial = { id: "snowman", displayName: "Snowman", baseUnit: "pcs", baseStock: 120, hasNegativeStock: false, variants, pricingMembers: variants,
  pricing: { initialized: true, config: { sourceProductId: "pcs", revision: 1, initializationVersion: 1, members: {
    pcs: { mode: "AUTO", factor: { numerator: "1", denominator: "1" }, review }, pak: { mode: "AUTO", factor: { numerator: "9", denominator: "10" }, review },
  } }, members: variants.map(v => ({ productId: v.id, price: v.price.toFixed(2), costPrice: v.costPrice.toFixed(2), review })) },
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const mode of ["catalog", "pos", "pos-only"]) {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const errors = [], puts = [], previews = [], applies = []; let stale = true;
    const detail = structuredClone(initial);
    page.on("pageerror", e => errors.push(e.message));
    await page.route("http://localhost:3018/**", async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>' });
      if (req.method() === "GET") return route.fulfill({ json: detail });
      const payload = req.postDataJSON();
      if (url.pathname === "/api/products/pak") { puts.push(payload); return route.fulfill({ json: { ...variants[1], ...payload } }); }
      const input = { groupId: "snowman", storeId: "sample", baseUnit: "pcs", config: structuredClone(detail.pricing.config), members: variants.map(v => ({ ...v, groupId: "snowman", storeId: "sample", price: String(v.price), costPrice: String(v.costPrice) })) };
      for (const change of payload.changes.members ?? []) {
        const member = input.members.find(m => m.id === change.productId);
        if (change.mode) input.config.members[member.id].mode = change.mode;
        if (change.factor) input.config.members[member.id].factor = change.factor;
        if (change.price !== undefined) member.price = change.price;
        if (change.costPrice !== undefined) member.costPrice = change.costPrice;
      }
      const after = await page.evaluate(input => window.project(input), input);
      if (req.method() === "POST") { previews.push(after); return route.fulfill({ json: { version: "v" + detail.pricing.config.revision, revision: detail.pricing.config.revision, projectionToken: JSON.stringify(after), before: detail.pricing, after } }); }
      applies.push(payload);
      if (stale) { stale = false; detail.pricing.config.revision++; return route.fulfill({ status: 409, json: { message: "Data grup berubah" } }); }
      assert.equal(payload.expectedVersion, "v" + detail.pricing.config.revision);
      assert.equal(payload.expectedProjection, JSON.stringify(after));
      detail.pricing = after; detail.pricing.config.revision++;
      return route.fulfill({ json: after });
    });
    await page.goto(`http://localhost:3018/fixture?${mode}`); await page.addStyleTag({ content: bundle.css }); await page.addScriptTag({ content: bundle.script });
    const agen = page.getByLabel("Harga Agen", { exact: true }); await agen.waitFor();
    if (mode !== "pos-only") await agen.fill("30000");
    if (mode !== "catalog") await page.getByLabel("Harga Khusus", { exact: true }).fill("29000");
    if (mode !== "pos-only") {
      await page.evaluate(() => window.refresh());
      assert.equal(await agen.inputValue(), "30000", "refresh preserves independent draft");
      await page.getByRole("button", { name: "Atur harga grup / Manual", exact: true }).click();
      await page.getByRole("dialog", { name: "Grup stok Snowman" }).waitFor();
      const source = page.getByLabel("Harga jual pcs", { exact: true }); await source.fill("3500");
      const preview = page.getByRole("button", { name: "Pratinjau harga", exact: true });
      const apply = page.getByRole("button", { name: "Terapkan harga grup", exact: true });
      await preview.click(); await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Terapkan harga grup').disabled);
      assert.equal(previews[0].members.find(m => m.productId === "pak").price, "37800.00");
      await apply.click(); await page.getByText("Data grup berubah. Input Anda tetap tersimpan; buat pratinjau baru.").waitFor();
      assert.equal(await apply.isDisabled(), true); assert.equal(await source.inputValue(), "3500");
      await preview.click(); await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Terapkan harga grup').disabled);
      await apply.click(); await page.getByText("Harga grup berhasil diterapkan.").waitFor();
      await page.getByRole("button", { name: "Tutup", exact: true }).click();
      assert.equal(await agen.inputValue(), "30000");
      if (mode === "pos") assert.equal(await page.getByLabel("Harga Khusus", { exact: true }).inputValue(), "29000");
    }
    await page.getByRole("button", { name: "Simpan Harga", exact: true }).click();
    await page.waitForFunction(() => window.closeCount === 1);
    if (mode === "catalog") {
      assert.equal(puts.length, 1); assert.equal(puts[0].hargaAgen, 30000);
      assert.equal(Object.hasOwn(puts[0], "price"), false); assert.equal(Object.hasOwn(puts[0], "costPrice"), false);
    } else {
      const [saved] = await page.evaluate(() => window.saved);
      assert.equal(saved.transactionPrice, 29000);
      if (mode === "pos-only") { assert.equal(saved.masterUpdate, null); assert.equal(previews.length, 0); assert.equal(applies.length, 0); }
      else { assert.equal(saved.masterUpdate.hargaAgen, 30000); assert.equal(Object.hasOwn(saved.masterUpdate, "price"), false); }
      assert.equal(puts.length, 0);
    }
    assert.deepEqual(errors, []); await page.close();
    process.stdout.write(`PASS ${mode}: real quick editor draft, versioned group action, independent payload\n`);
  }
} finally { await browser.close(); }
