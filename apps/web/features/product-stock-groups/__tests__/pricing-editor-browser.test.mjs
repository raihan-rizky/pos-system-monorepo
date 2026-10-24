import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { bundleReactHarness } from "./browser-harness.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const bundle = await bundleReactHarness(`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import ProductFormModal from './components/inventory/ProductFormModal';import {EditProductModal} from './components/EditProductModal';
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});const initial={id:'pak',name:'Snowman',sku:'SN-PAK',price:32400,costPrice:24000,stock:10,minStock:5,unit:'pak',unitMultiplierToBase:12,stockGroupId:'snowman',category:{id:'paper',name:'Alat tulis',icon:null,color:null},size:null,material:null,imageUrl:null,hargaDinas:null,hargaAgen:null,isActive:true};function Harness(){const[p,setP]=useState(initial);window.replaceProduct=()=>setP({...initial,price:37800,costPrice:25000});return <QueryClientProvider client={client}>{location.search.includes('legacy')?<EditProductModal open product={p} onClose={()=>window.closeCount++}/>:<ProductFormModal isOpen productId={p.id} initialData={p} categories={[initial.category]} onClose={()=>window.closeCount++}/>}</QueryClientProvider>}window.closeCount=0;createRoot(document.getElementById('root')).render(<Harness/>);`, ["components/inventory/ProductFormModal.tsx", "components/EditProductModal.tsx", "features/product-stock-groups/components/ProductPricingAction.tsx", "features/product-stock-groups/components/StockGroupWorkspace.tsx", "features/product-stock-groups/components/GroupPricingPanel.tsx"]);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const legacy of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const puts = [], errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.route("http://localhost:3015/**", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>' });
      if (request.method() === "PUT") { puts.push(request.postDataJSON()); return route.fulfill({ json: { id: "pak" } }); }
      if (url.pathname === "/api/product-stock-groups/snowman") return route.fulfill({ json: { id: "snowman", displayName: "Snowman", baseUnit: "pcs", baseStock: 120, hasNegativeStock: false, variants: [], pricing: { initialized: true, members: [], config: { sourceProductId: null, revision: 1, initializationVersion: 1, members: {} } } } });
      return route.fulfill({ json: { data: url.pathname === "/api/categories" ? [{ id: "paper", name: "Alat tulis" }] : [] } });
    });
    await page.goto(`http://localhost:3015/fixture?${legacy ? "legacy" : "inventory"}`); await page.addStyleTag({ content: bundle.css }); await page.addScriptTag({ content: bundle.script });
    const name = page.getByLabel(legacy ? "Nama Barang *" : "Nama Produk", { exact: true });
    const sku = page.getByLabel(legacy ? "SKU / Kode *" : "SKU / Kode Barang", { exact: true });
    // Legacy labels predate explicit input associations; keep the interaction real.
    const nameInput = name;
    const skuInput = sku;
    await nameInput.waitFor(); await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'SN-PAK'));
    await skuInput.fill("SN-PAK-DRAFT");
    const action = page.getByRole("button", { name: "Atur harga grup / Manual", exact: true });
    await nameInput.fill("Snowman baru"); assert.equal(await action.isDisabled(), true, "pending membership change blocks old-group pricing");
    await nameInput.fill("Snowman"); assert.equal(await action.isEnabled(), true);
    await page.evaluate(() => window.replaceProduct());
    assert.equal(await skuInput.inputValue(), "SN-PAK-DRAFT", "catalog refresh keeps unsaved details");
    await action.click(); await page.getByRole("dialog", { name: "Grup stok Snowman" }).waitFor();
    await page.getByRole("tab", { name: "Harga", exact: true }).waitFor();
    assert.equal(await page.getByRole("tab", { name: "Harga", exact: true }).getAttribute("aria-selected"), "true");
    await page.getByRole("button", { name: "Tutup", exact: true }).click();
    assert.equal(await skuInput.inputValue(), "SN-PAK-DRAFT", "closing separate price action preserves details");
    await page.getByRole("button", { name: legacy ? "Simpan Perubahan" : "Simpan Produk", exact: true }).click();
    await page.waitForFunction(() => window.closeCount === 1);
    assert.equal(puts.length, 1); assert.equal(puts[0].sku, "SN-PAK-DRAFT");
    assert.equal(Object.hasOwn(puts[0], "price"), false); assert.equal(Object.hasOwn(puts[0], "costPrice"), false);
    assert.deepEqual(errors, []); await page.close();
    process.stdout.write(`PASS ${legacy ? "legacy" : "inventory"} editor: separate versioned price action, membership guard, local draft retention, single details PUT omits money` + "\n");
  }
} finally { await browser.close(); }
