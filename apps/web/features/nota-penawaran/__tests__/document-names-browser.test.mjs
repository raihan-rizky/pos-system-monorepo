// node apps/web/features/nota-penawaran/__tests__/document-names-browser.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { bundleReactHarness } from "../../product-stock-groups/__tests__/browser-harness.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const bundle = await bundleReactHarness(`
  import React,{useState} from 'react';
  import {createRoot} from 'react-dom/client';
  import {NotaPenawaranModal} from './features/nota-penawaran/components/NotaPenawaranModal';
  const items=[
    {cartLineId:'p1:first',lineType:'PRODUCT',productId:'p1',name:'Kertas A4',price:50000,quantity:1,unit:'rim',stock:0},
    {cartLineId:'p1:second',lineType:'PRODUCT',productId:'p1',name:'Kertas A4',price:50000,quantity:1,unit:'rim',stock:0},
  ];
  window.originalItems=JSON.stringify(items);window.cartItems=items;window.saves=[];
  function Harness(){
    const [open,setOpen]=useState(true);
    return <><button onClick={()=>setOpen(true)}>Buka nota</button>
      <NotaPenawaranModal open={open} items={items} role="OWNER" onClose={()=>setOpen(false)} onSubmit={input=>window.saves.push(input)}/>
    </>;
  }
  createRoot(document.getElementById('root')).render(<Harness/>);
`, ["features/nota-penawaran/components/NotaPenawaranModal.tsx", "features/transactions-draft/components/DraftNumberField.tsx"]);

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://localhost:3004/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>' });
    if (url.pathname === "/api/time") return route.fulfill({ json: { serverEpochMs: Date.parse("2026-10-19T03:00:00Z"), source: "SERVER_FALLBACK", lastSyncedAt: null } });
    if (url.pathname === "/api/transactions/draft") return route.fulfill({ json: { draftNumber: "PNW-TLD-20261019-004" } });
    return route.fulfill({ status: 404 });
  });
  await page.goto("http://localhost:3004/fixture");
  await page.addStyleTag({ content: bundle.css });
  await page.addScriptTag({ content: bundle.script });
  const names = page.getByLabel("Nama pada nota", { exact: true });
  await names.first().waitFor();
  assert.equal(await names.count(), 2);
  assert.equal(await names.nth(0).inputValue(), "Kertas A4");
  assert.equal(await names.nth(1).inputValue(), "Kertas A4");
  assert.equal(await page.getByText("Nama POS: Kertas A4", { exact: true }).count(), 2);
  assert.equal(await names.nth(0).getAttribute("maxlength"), "300");
  await page.getByLabel("Kepada Yth").fill("PT Contoh");
  await names.nth(0).fill("   ");
  await page.getByRole("button", { name: "Simpan Nota Penawaran", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Nama pada nota" }).waitFor();
  assert.equal(await page.evaluate(() => window.saves.length), 0);
  await names.nth(0).fill("  Kertas untuk rapat  ");
  await page.getByLabel("Qty Kertas A4", { exact: true }).nth(0).fill("2");
  await page.getByLabel("Harga nota Kertas A4", { exact: true }).nth(0).fill("47500");
  assert.equal(await names.nth(0).inputValue(), "  Kertas untuk rapat  ");
  await page.getByRole("button", { name: "Simpan Nota Penawaran", exact: true }).click();
  await page.waitForFunction(() => window.saves.length === 1);
  assert.deepEqual(await page.evaluate(() => window.saves[0].items.map(({name,documentName,price,quantity})=>({name,documentName,price,quantity}))), [
    { name: "Kertas A4", documentName: "Kertas untuk rapat", price: 47500, quantity: 2 },
    { name: "Kertas A4", documentName: null, price: 50000, quantity: 1 },
  ]);
  await page.getByRole("button", { name: "Kembalikan nama POS", exact: true }).nth(0).click();
  assert.equal(await names.nth(0).inputValue(), "Kertas A4");
  await page.getByRole("button", { name: "Simpan Nota Penawaran", exact: true }).click();
  await page.waitForFunction(() => window.saves.length === 2);
  assert.equal(await page.evaluate(() => window.saves[1].items[0].documentName), null);
  assert.equal(await page.evaluate(() => JSON.stringify(window.cartItems) === window.originalItems), true);
  await names.nth(0).fill("Nama sementara");
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  await page.getByRole("button", { name: "Buka nota", exact: true }).click();
  assert.equal(await names.nth(0).inputValue(), "Kertas A4");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(errors, []);
  console.log("PASS: dua nama terlihat, edit nama per baris, validasi kosong, reset POS, qty/harga tetap, keranjang asli tetap, dan mobile.");
} finally {
  await browser.close();
}
