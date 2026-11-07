import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const repo = path.resolve(web, "../..");
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const bundle = await build({
  stdin: { resolveDir: web, loader: "tsx", contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { InboundReceiptModal } from './features/inventory-management/components/InboundReceiptModal';
    import { InboundReceiptReviewModal } from './features/inventory-management/components/InboundReceiptReviewModal';
    const root = createRoot(document.getElementById('root'));
    const units = id => [{ productId:id, unit:'dus', unitMultiplierToBase:1, costPrice:250000, price:300000, hargaAgen:280000, hargaDinas:270000, isActive:true }];
    const purchase = { id:'gp-1', number:'PB-CONTOH', totalAmount:2000000, supplierId:'supplier-1', supplierName:'Pemasok Contoh', fulfillmentStatus:'NOT_RECEIVED', pendingReceiptCount:0,
      items:[{goodsPurchaseItemId:'item-1',productId:'product-1',productName:'Kertas Contoh',sku:'K-1',unit:'dus',currentCostPrice:250000,pricingUnits:units('product-1'),orderedQuantity:8,approvedReceivedQuantity:0,pendingReservedQuantity:0,availableQuantity:8}] };
    const payments = [{method:'GIRO',amount:700000,dueDate:'2026-11-14',note:'7 hari'},{method:'GIRO',amount:1300000,dueDate:'2026-12-07',note:'30 hari'}];
    let receipt = { id:'receipt-1',goodsPurchaseId:'gp-1',goodsPurchaseNumber:'PB-CONTOH',status:'SUBMITTED',createdAt:'2026-11-07T01:00:00Z',supplier:{name:'Pemasok Contoh'},payments,
      lines:[{id:'line-1',updatedAt:'2026-11-07T01:00:00Z',productId:'product-1',goodsPurchaseItemId:'item-1',productNameSnapshot:'Kertas Contoh',unitSnapshot:'dus',skuSnapshot:'K-1',expectedQuantity:10,receivedQuantity:8,costPriceSnapshot:250000,supplierCostPrice:250000,status:'RECEIVED',matchStatus:'MATCHED',reviewStatus:'PENDING',note:null,pricingUnits:units('product-1')}] };
    const comparison = {goodsPurchaseId:'gp-1',goodsPurchaseNumber:'PB-CONTOH',supplierName:'Pemasok Contoh',fulfillmentStatus:'NOT_RECEIVED',receipts:[],items:[
      {goodsPurchaseItemId:'item-1',productId:'product-1',productName:'Kertas Contoh',unit:'dus',sku:'K-1',orderedQuantity:8,approvedReceivedQuantity:0,pendingReservedQuantity:8,remainingQuantity:0,pricingUnits:units('product-1')},
      {goodsPurchaseItemId:'item-2',productId:'product-2',productName:'Buku Contoh',unit:'dus',sku:'B-2',orderedQuantity:8,approvedReceivedQuantity:0,pendingReservedQuantity:0,remainingQuantity:8,pricingUnits:units('product-2'),isAvailableProduct:true}]};
    window.savedCreates = []; window.savedEdits = []; window.messages = []; window.confirm = () => true;
    window.fetch = async (url, options = {}) => {
      const method = options.method ?? 'GET';
      if(url.includes('receiving-queue')) return new Response(JSON.stringify({data:{purchases:[purchase],items:[]}}));
      if(url.includes('receiving-comparison')) {
        if(!url.startsWith('/api/inventory-management/')) return new Response(JSON.stringify({message:'Tidak memiliki akses Supplier'}),{status:403});
        return new Response(JSON.stringify({data:comparison}));
      }
      if(method === 'POST') { window.savedCreates.push(JSON.parse(options.body)); return new Response(JSON.stringify({data:{id:'new-receipt',status:'SUBMITTED'}})); }
      if(method === 'PATCH') { const input = JSON.parse(options.body); window.savedEdits.push(input); receipt = {...receipt,lines:[{...receipt.lines[0],...input,expectedQuantity:8,productNameSnapshot:'Buku Contoh',goodsPurchaseItemId:'item-2',reviewStatus:'PENDING'}]}; return new Response(JSON.stringify({data:{id:'receipt-1',status:'SUBMITTED'},finalized:false})); }
      return new Response(JSON.stringify({data:[receipt]}));
    };
    const success = message => window.messages.push(message);
    window.createView = () => root.render(<InboundReceiptModal key="create" open onClose={()=>{}} onSuccess={success} />);
    window.reviewView = () => root.render(<InboundReceiptReviewModal key="review" open receipt={receipt} comparison={comparison} canEdit canApprove={false} canReject={false} onClose={()=>{}} onSuccess={success} />);
    window.createView();
  ` },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web, "@pos/ui": path.join(repo, "packages/ui/src/index.ts") },
  define: { "process.env.NODE_ENV": '"production"' },
});
const css = await postcss([tailwind({ content: [path.join(web, "features/inventory-management/components/*.tsx"), path.join(repo, "packages/ui/src/**/*.tsx")], theme: { extend: { colors: { brand: { 50:'#f0f9ff',500:'#0284c7',600:'#0369a1',700:'#075985' } } } }, plugins: [] })])
  .process("@tailwind base; @tailwind components; @tailwind utilities;", { from: undefined });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const errors = []; page.on("pageerror", error => errors.push(String(error)));
  await page.setContent('<div role="note" style="padding:8px">Data contoh untuk pengujian</div><div id="root"></div>');
  await page.addStyleTag({ content: css.css });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.locator('[name="inboundLines.item-1.receivedQuantity"]').fill("8");
  await page.locator('[name="paymentMethod"]').selectOption("GIRO");
  await page.locator('[name="payments.0.amount"]').fill("700000");
  await page.locator('[name="paymentDueDate"]').fill("2026-11-14");
  await page.getByRole("button", { name: "Tambah Giro" }).click();
  assert.equal(await page.locator('[name="payments.1.amount"]').inputValue(), "1300000");
  await page.locator('[name="payments.1.dueDate"]').fill("2026-12-07");
  await page.locator('[name="payments.1.amount"]').fill("1000000");
  await page.getByRole("button", { name: "Ajukan ke Owner" }).click();
  await page.getByRole("alert").filter({hasText:/Total pembayaran harus sama/}).waitFor();
  assert.equal(await page.evaluate(() => window.savedCreates.length), 0);
  await page.locator('[name="payments.1.amount"]').fill("1300000");
  await page.locator('[name="payments.0.note"]').fill("Data contoh: 7 hari");
  await page.locator('[name="payments.1.note"]').fill("Data contoh: 30 hari");
  await mkdir(path.join(repo, 'output/playwright/penerimaan-multi-giro'), { recursive: true });
  const paymentFieldset = page.locator('fieldset').filter({ has: page.locator('legend', {hasText:'Pembayaran Pembelian'}) }).first();
  await page.setViewportSize({width:1100,height:1600});
  await paymentFieldset.scrollIntoViewIfNeeded();
  const firstBox = await paymentFieldset.locator('fieldset').first().boundingBox();
  const lastBox = await paymentFieldset.locator('fieldset').last().boundingBox();
  await page.screenshot({ path: path.join(repo, 'output/playwright/penerimaan-multi-giro/giro-rows.png'), clip: {
    x:firstBox.x, y:firstBox.y, width:firstBox.width, height:lastBox.y+lastBox.height-firstBox.y,
  } });
  await page.getByRole("button", { name: "Ajukan ke Owner" }).click();
  await page.waitForFunction(() => window.savedCreates.length === 1);
  const created = await page.evaluate(() => window.savedCreates[0]);
  assert.deepEqual(created.payments.map(({method,amount,dueDate}) => ({method,amount,dueDate})), [
    {method:'GIRO',amount:700000,dueDate:'2026-11-14'}, {method:'GIRO',amount:1300000,dueDate:'2026-12-07'},
  ]);
  await page.evaluate(() => window.reviewView());
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const selector = page.getByLabel('Barang Diterima', { exact: false });
  await selector.selectOption('product-2');
  await page.getByLabel('Jumlah Diterima', { exact: true }).fill('8');
  await page.getByRole('button', {name:'Simpan Perubahan'}).click();
  await page.waitForFunction(() => window.savedEdits.length === 1 && window.messages.includes('Produk berhasil diedit.'), {timeout:4000});
  assert.equal(await page.evaluate(() => window.savedEdits[0].receivedQuantity), 8);
  assert.equal(await page.evaluate(() => window.savedEdits[0].note), null);
  await page.getByRole('button', {name:'Edit',exact:true}).click();
  await page.getByLabel('Jumlah Diterima', { exact: true }).fill('4');
  await page.getByLabel('Catatan', { exact: true }).fill('Data contoh: koreksi barang');
  await page.getByRole('button', {name:'Simpan Perubahan'}).click();
  await page.waitForFunction(() => window.savedEdits.length === 2);
  assert.equal(await page.evaluate(() => window.savedEdits[1].productId), 'product-2');
  assert.equal(await page.evaluate(() => window.savedEdits[1].receivedQuantity), 4);
  assert.equal(await page.getByRole('button', {name:'Setujui Item'}).count(), 0);
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button', {name:'Edit',exact:true}).click();
  await selector.focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'SELECT');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({path:path.join(repo,'output/playwright/penerimaan-multi-giro/edit-mobile.png'),fullPage:true});
  assert.deepEqual(errors, []);
  process.stdout.write('PASS: multi-giro validation/submission, product + quantity editing, permission controls, keyboard and 390px layout.\n');
} finally { await browser.close(); }
