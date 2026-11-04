import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { bundleReactHarness } from "../../product-stock-groups/__tests__/browser-harness.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const bundle = await bundleReactHarness(`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {RoleProvider} from './components/providers/RoleProvider';
import {ProductCard} from './features/pos-product-variants/components/ProductCard';
const variants=[{id:'one',unit:'dus',price:99999999,hargaAgen:99999999,stock:10,sku:'DUS'},{id:'two',unit:'pcs',price:5000,hargaAgen:4500,stock:100,sku:'PCS'}];
const product={id:'sample',name:'Kertas contoh',sku:'DUS',price:99999999,stock:10,unit:'dus',minStock:5,isActive:true,categoryId:'paper',category:{id:'paper',name:'Kertas',icon:null,color:null},imageUrl:null,defaultVariant:variants[0],variants};
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
createRoot(document.getElementById('root')).render(<RoleProvider role='OWNER' userId='fixture' userName='Contoh'><QueryClientProvider client={client}><div id='card-container' style={{width:160}}><ProductCard product={product} customerType='AGEN' onAddToCart={()=>{}}/></div></QueryClientProvider></RoleProvider>);
`, [
  "features/pos-product-variants/components/ProductCard.tsx",
  "features/customer-category-pricing/components/SpecialPriceBadge.tsx",
]);

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
  await page.route("http://localhost:3021/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><script>window.process={env:{}};</script><div id="root"></div></body></html>' });
    return route.fulfill({ json: { enabled: false } });
  });
  await page.goto("http://localhost:3021/fixture");
  await page.addStyleTag({ content: bundle.css });
  await page.addScriptTag({ content: bundle.script });
  const badges = page.locator('button [aria-label="Harga manual"]');
  await badges.first().waitFor();
  assert.equal(await badges.count(), 2);
  const bounds = await badges.evaluateAll(elements => elements.map(element => {
    const badge = element.getBoundingClientRect();
    const button = element.closest("button").getBoundingClientRect();
    return { badgeLeft: badge.left, badgeRight: badge.right, buttonLeft: button.left, buttonRight: button.right, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  }));
  for (const box of bounds) {
    assert.ok(box.badgeLeft >= box.buttonLeft && box.badgeRight <= box.buttonRight, "unit badge fits inside its button");
    assert.ok(box.scrollWidth <= box.clientWidth, "unit badge text remains inside the visible badge");
  }
  const selectedBadge = page.locator('p.text-base').locator('..').locator('[aria-label="Harga manual"]');
  assert.equal(await selectedBadge.count(), 1);
  const selectedBounds = await selectedBadge.evaluate(element => {
    const badge = element.getBoundingClientRect();
    const card = document.getElementById('card-container').getBoundingClientRect();
    return { left: badge.left, right: badge.right, cardLeft: card.left, cardRight: card.right };
  });
  assert.ok(selectedBounds.left >= selectedBounds.cardLeft && selectedBounds.right <= selectedBounds.cardRight, "selected price badge fits inside the card");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log("PASS mobile POS: manual labels remain visible inside both unit buttons");
} finally {
  await browser.close();
}
