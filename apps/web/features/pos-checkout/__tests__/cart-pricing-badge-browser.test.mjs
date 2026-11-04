import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { bundleReactHarness } from "../../product-stock-groups/__tests__/browser-harness.mjs";

const { chromium } = createRequire(import.meta.url)("@playwright/test");
const bundle = await bundleReactHarness(`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {CartSidebar} from './components/CartSidebar';
const item={cartLineId:'example',lineType:'PRODUCT',productId:'paper',name:'Contoh',price:10000,catalogPrice:10000,hargaAgen:9000,hargaDinas:8000,quantity:1,unit:'rim',stock:10,categoryId:'paper',categoryName:'Kertas'};
createRoot(document.getElementById('root')).render(<div id='cart' style={{width:320}}><CartSidebar items={[item]} subtotal={10000} totalItems={1} specialPricingEnabled={false} onUpdateQuantity={()=>{}} onRemoveItem={()=>{}} onClearCart={()=>{}} onCheckout={()=>{}}/></div>);
`, ["components/CartSidebar.tsx", "features/customer-category-pricing/components/SpecialPriceBadge.tsx"]);

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
  await page.setContent('<html lang="id"><body><div id="root"></div></body></html>');
  await page.addStyleTag({ content: bundle.css });
  await page.addScriptTag({ content: bundle.script });
  const badges = page.locator('dl [aria-label="Harga manual"]');
  assert.equal(await badges.count(), 2);
  for (const box of await badges.evaluateAll(elements => elements.map(element => {
    const badge = element.getBoundingClientRect();
    const cell = element.closest('dd').getBoundingClientRect();
    return { left: badge.left, right: badge.right, cellLeft: cell.left, cellRight: cell.right };
  }))) {
    assert.ok(box.left >= box.cellLeft && box.right <= box.cellRight, "manual badge fits inside its cart reference");
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log("PASS mobile cart: manual pricing badges fit their reference cells");
} finally {
  await browser.close();
}
