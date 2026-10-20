import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { web, repo } from "../../product-stock-groups/__tests__/browser-harness.mjs";

const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("vitest")] }));
const { chromium } = require("@playwright/test");
const bundle = await build({
  stdin: { contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
    import {RoleProvider} from './components/providers/RoleProvider';
    import {DraftReceiptModal} from './components/DraftReceiptModal';
    const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
    const transaction={id:'draft-1',draftNumber:'PNW-TLD-20261018-003',status:'DRAFT',total:10000,items:[],customerName:'PT Contoh',createdAt:'2026-10-18T03:00:00Z'};
    window.prints=[];
    window.print=()=>window.prints.push(document.querySelector('#draft-receipt-page').textContent);
    function Harness(){
      const [open,setOpen]=useState(false);
      const [role,setRole]=useState('OWNER');
      return <QueryClientProvider client={client}><RoleProvider role={role} userId="owner" userName="Owner">
        <button onClick={()=>setOpen(true)}>Buka cetak</button>
        <button onClick={()=>setRole('SALES')}>Pakai Sales</button>
        <DraftReceiptModal open={open} onClose={()=>setOpen(false)} transaction={transaction}/>
      </RoleProvider></QueryClientProvider>;
    }
    createRoot(document.getElementById('root')).render(<Harness/>);
  `, resolveDir: web, loader: "tsx" },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  loader: { ".css": "empty" },
  alias: { "@": web, "@pos/ui": path.join(repo, "packages/ui/src/index.ts") },
  define: { "process.env.NODE_ENV": '"production"' },
});

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let saved = "PNW-TLD-20261018-003";
  let failSave = false;
  let failLoad = false;
  let writes = 0;
  let delaySave;
  await page.route("http://localhost:3004/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>' });
    if (url.pathname === "/api/settings/store") return route.fulfill({ json: { name: "Toko Teladan" } });
    if (url.pathname.endsWith("/document-item-names")) return route.fulfill({ json: { items: [] } });
    if (url.pathname === "/api/transactions/draft-1/tax") return route.fulfill({ json: {
      transaction: { id: "draft-1", subtotal: 10000, discount: 0, tax: 0, taxRate: null, taxMethod: "STANDARD", total: 10000, amountPaid: 0, change: 0, status: "DRAFT", paymentMethod: "CASH" },
      snapshot: { total: 10000, tax: 0, taxRate: null, taxMethod: "STANDARD", amountPaid: 0, change: 0, status: "DRAFT" },
    } });
    if (url.pathname === "/api/transactions/draft-1/draft-number") {
      if (route.request().method() === "PATCH") {
        writes++;
        if (delaySave) await delaySave;
        if (failSave) return route.fulfill({ status: 409, json: { message: "No. Faktur sudah digunakan. Silakan gunakan nomor lain." } });
        saved = route.request().postDataJSON().draftNumber ?? "PNW-TLD-20261018-011";
        return route.fulfill({ json: { draftNumber: saved } });
      }
      if (failLoad) return route.fulfill({ status: 503, json: { message: "Nomor faktur belum dapat dimuat." } });
      return route.fulfill({ json: { draftNumber: saved, automaticNumber: /^PNW-TLD-/.test(saved) ? saved : "PNW-TLD-20261018-010" } });
    }
    return route.fulfill({ status: 404, body: "Unknown fixture" });
  });
  await page.goto("http://localhost:3004/fixture");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const open = () => page.getByRole("button", { name: "Buka cetak", exact: true }).click();
  const print = () => page.getByRole("button", { name: "Cetak Nota Penawaran", exact: true }).click();
  const number = page.getByLabel("No. Faktur", { exact: true });
  const close = () => page.getByRole("button", { name: "Tutup", exact: true }).click();
  await open();
  await page.waitForFunction(() => !document.querySelector('[name="draftNumber"]').disabled);
  assert.equal(await number.inputValue(), "003/PNW-TLD/18/X/2026");
  await print();
  await page.waitForFunction(() => window.prints.length === 1);
  assert.equal(writes, 0, "printing the current number must not renumber it");

  await number.fill("  CUSTOM/001  ");
  let releaseSave;
  delaySave = new Promise(resolve => { releaseSave = resolve; });
  await print();
  assert.equal(await page.evaluate(() => window.prints.length), 1, "must wait for persistence before printing");
  releaseSave();
  delaySave = undefined;
  await page.waitForFunction(() => window.prints.length === 2);
  assert.equal(saved, "CUSTOM/001");
  assert.match(await page.evaluate(() => window.prints[1]), /CUSTOM\/001/);
  await close();
  await open();
  await page.waitForFunction(() => document.querySelector('[name="draftNumber"]').value === "CUSTOM/001");
  await print();
  await page.waitForFunction(() => window.prints.length === 3);
  assert.equal(writes, 1, "reopening must load the persisted number even with stale parent data");

  await page.getByRole("button", { name: "Gunakan otomatis", exact: true }).click();
  assert.equal(await number.inputValue(), "010/PNW-TLD/18/X/2026");
  await print();
  await page.waitForFunction(() => window.prints.length === 4);
  assert.equal(saved, "PNW-TLD-20261018-011");
  assert.match(await page.evaluate(() => window.prints[3]), /011\/PNW-TLD\/18\/X\/2026/, "print must use the final allocation, even when the preview changed during save");
  assert.equal(await number.inputValue(), "011/PNW-TLD/18/X/2026");
  const autoWrites = writes;
  await print();
  await page.waitForFunction(() => window.prints.length === 5);
  assert.equal(writes, autoWrites, "reprinting an automatic number must not allocate another number");

  failSave = true;
  await number.fill("DUPLICATE");
  await print();
  await page.getByRole("alert").filter({ hasText: "sudah digunakan" }).waitFor();
  assert.equal(await page.evaluate(() => window.prints.length), 5);
  assert.equal(await number.inputValue(), "DUPLICATE");
  failSave = false;
  await number.fill("CUSTOM/002");
  await print();
  await page.waitForFunction(() => window.prints.length === 6);
  assert.equal(saved, "CUSTOM/002");

  await close();
  await page.getByRole("button", { name: "Pakai Sales", exact: true }).click();
  await open();
  await page.waitForFunction(() => document.querySelector('[name="draftNumber"]').value === "CUSTOM/002");
  assert.equal(await number.isDisabled(), true);
  const previousWrites = writes;
  await print();
  await page.waitForFunction(() => window.prints.length === 7);
  assert.equal(writes, previousWrites);
  await close();
  failLoad = true;
  await open();
  await page.getByRole("alert").filter({ hasText: "belum dapat dimuat" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Cetak Nota Penawaran", exact: true }).isDisabled(), true, "must not print stale parent numbers after a read failure");
  assert.deepEqual(errors, []);
  process.stdout.write("PASS: saved custom/automatic numbers, reprint, save-before-print, duplicate retry, Sales permissions, and load failure\n");
} finally {
  await browser.close();
}
