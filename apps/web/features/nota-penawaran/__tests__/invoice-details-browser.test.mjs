// node apps/web/features/nota-penawaran/__tests__/invoice-details-browser.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { bundleReactHarness } from "../../product-stock-groups/__tests__/browser-harness.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const bundle = await bundleReactHarness(`
  import React, {useState} from 'react';
  import {createRoot} from 'react-dom/client';
  import {NotaPenawaranModal} from './features/nota-penawaran/components/NotaPenawaranModal';
  const items=[{cartLineId:'p1',lineType:'PRODUCT',productId:'p1',name:'Kertas',price:10000,quantity:1,unit:'Rim',stock:0}];
  function Harness(){
    const [open,setOpen]=useState(false);
    const [role,setRole]=useState('OWNER');
    return <><button onClick={()=>setOpen(true)}>Buka nota</button>
      <button onClick={()=>setRole('SALES')}>Pakai Sales</button>
      <NotaPenawaranModal open={open} items={items} role={role} onClose={()=>setOpen(false)} onSubmit={input=>{window.saved=input;}}/>
    </>;
  }
  createRoot(document.getElementById('root')).render(<Harness/>);
`, ["features/nota-penawaran/components/NotaPenawaranModal.tsx", "features/transactions-draft/components/DraftNumberField.tsx"]);

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let now = Date.parse("2026-10-14T20:30:00Z");
  let failPreview = false;
  await page.route("http://localhost:3004/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>' });
    if (url.pathname === "/api/time") return route.fulfill({ json: { serverEpochMs: now, source: "SERVER_FALLBACK", lastSyncedAt: null } });
    if (url.pathname === "/api/transactions/draft") return route.fulfill({ status: failPreview ? 503 : 200, json: { draftNumber: "PNW-TLD-20261015-004" } });
    return route.fulfill({ status: 404, body: "Unknown fixture" });
  });
  await page.goto("http://localhost:3004/fixture");
  await page.addStyleTag({ content: bundle.css });
  await page.addScriptTag({ content: bundle.script });
  await page.getByRole("button", { name: "Buka nota", exact: true }).click();
  console.log("Buka nota: memeriksa nilai awal dan nomor otomatis");
  const number = page.getByLabel("No. Faktur", { exact: true });
  const date = page.getByLabel("Tanggal Nota (WIB)");
  const time = page.getByLabel("Jam Nota (WIB)");
  await number.waitFor();
  await page.waitForFunction(() => document.querySelector('[name="draftNumber"]').value === "004/PNW-TLD/15/X/2026");
  assert.equal(await date.inputValue(), "2026-10-15");
  assert.equal(await time.inputValue(), "03:30");
  await number.fill("CUSTOM/001");
  await date.fill("2026-10-10");
  await time.fill("09:45");
  await page.getByLabel("Alasan perubahan tanggal").fill("Sesuai nota manual");
  await page.getByLabel("Kepada Yth").fill("PT Contoh");
  await page.waitForTimeout(1200);
  assert.equal(await date.inputValue(), "2026-10-10");
  assert.equal(await time.inputValue(), "09:45");
  assert.equal(await number.inputValue(), "CUSTOM/001");
  await page.getByRole("button", { name: "Simpan Nota Penawaran", exact: true }).click();
  await page.waitForFunction(() => window.saved?.draftNumber === "CUSTOM/001");
  assert.deepEqual(await page.evaluate(() => ({ number: window.saved.draftNumber, date: window.saved.invoiceDate, time: window.saved.invoiceTime, reason: window.saved.invoiceDateReason })), {
    number: "CUSTOM/001", date: "2026-10-10", time: "09:45", reason: "Sesuai nota manual",
  });
  await page.getByRole("button", { name: "Gunakan otomatis", exact: true }).click();
  assert.equal(await number.inputValue(), "004/PNW-TLD/15/X/2026");
  await page.getByRole("button", { name: "Simpan Nota Penawaran", exact: true }).click();
  await page.waitForFunction(() => window.saved && !window.saved.draftNumber);
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  console.log("Nomor dan payload tersimpan; memeriksa waktu saat dibuka kembali");
  now = Date.parse("2026-10-15T21:31:00Z");
  failPreview = true;
  await page.getByRole("button", { name: "Buka nota", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#nota-invoice-date').value === "2026-10-16");
  assert.equal(await time.inputValue(), "04:31");
  await page.getByText("Nomor otomatis belum dapat ditampilkan.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Simpan Nota Penawaran", exact: true }).click();
  await page.waitForFunction(() => window.saved?.invoiceDate === "2026-10-16");
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  await page.getByRole("button", { name: "Pakai Sales", exact: true }).click();
  await page.getByRole("button", { name: "Buka nota", exact: true }).click();
  assert.equal(await date.getAttribute("readonly"), "");
  await number.fill("SALES/001");
  await page.getByRole("button", { name: "Simpan Nota Penawaran", exact: true }).click();
  await page.waitForFunction(() => window.saved?.draftNumber === "SALES/001");
  assert.equal(await page.evaluate(() => Object.hasOwn(window.saved, 'invoiceDate')), false);
  assert.deepEqual(errors, []);
  console.log("PASS: nomor custom/otomatis, payload tanggal dan jam, edit tetap tersimpan saat jam berjalan, reset ketika dibuka kembali, fallback preview, dan akses Sales.");
} finally {
  await browser.close();
}
