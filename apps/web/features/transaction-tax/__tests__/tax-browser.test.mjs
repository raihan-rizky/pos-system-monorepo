import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { readFile } from "node:fs/promises";
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
    import {ReceiptModal} from './components/ReceiptModal';
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    const base={id:'tax-1',subtotal:706000,discount:0,tax:0,taxRate:null,taxMethod:'STANDARD',total:706000,amountPaid:706000,change:0,status:'COMPLETED',paymentMethod:'CASH',items:[],customerName:'PT Contoh',createdAt:'2026-10-18T03:00:00Z'};
    window.prints=[];
    window.print=()=>window.prints.push(document.querySelector('#draft-receipt-page')?.textContent || document.querySelector('#print-receipt')?.textContent);
    function Harness(){
      const [open,setOpen]=useState(false); const [draft,setDraft]=useState(false);
      const [selected,setSelected]=useState(null); const [viewOnly,setViewOnly]=useState(false);
      return <QueryClientProvider client={client}><RoleProvider role={viewOnly?'SALES':'OWNER'} userId="fixture-user" userName="Pengguna">
        <button onClick={()=>{setSelected(null);setViewOnly(false);setDraft(false);setOpen(true)}}>Buka biasa</button>
        <button onClick={()=>{setSelected(null);setViewOnly(false);setDraft(true);setOpen(true)}}>Buka penawaran</button>
        <button onClick={()=>{setSelected({...base,id:'final-dpp',taxRate:12,taxMethod:'DPP_NILAI_LAIN',tax:77660,total:783660});setViewOnly(false);setOpen(true)}}>Buka DPP selesai</button>
        <button onClick={()=>{setSelected({...base,id:'discount-regular',subtotal:100000,discount:10000,total:90000,amountPaid:90000});setViewOnly(false);setOpen(true)}}>Buka diskon biasa</button>
        <button onClick={()=>{setSelected({...base,id:'discount-draft',subtotal:706000,discount:106000,total:600000,status:'DRAFT',amountPaid:0});setViewOnly(false);setOpen(true)}}>Buka diskon penawaran</button>
        <button onClick={()=>{setSelected({...base,id:'tax-1'});setViewOnly(true);setOpen(true)}}>Lihat biasa</button>
        <button onClick={()=>{setSelected({...base,id:'draft-tax',status:'DRAFT',amountPaid:0});setViewOnly(true);setOpen(true)}}>Lihat penawaran</button>
        <ReceiptModal open={open} onClose={()=>setOpen(false)} transaction={selected??(draft?{...base,id:'draft-tax',status:'DRAFT',amountPaid:0,draftNumber:'PNW-TLD-20261018-001'}:base)}/>
      </RoleProvider></QueryClientProvider>;
    }
    createRoot(document.getElementById('root')).render(<Harness/>);
  `, resolveDir: web, loader: "tsx" },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  loader: { ".css": "empty" }, alias: { "@": web, "@pos/ui": path.join(repo, "packages/ui/src/index.ts") },
  define: { "process.env.NODE_ENV": '"production"' },
});

// Both stylesheets are imported by ReceiptModal's real component tree. Include
// them in the fixture to exercise print visibility instead of checking classes.
const printStyles = (await Promise.all(["receipt-print.css", "draft-receipt-print.css"].map(file => readFile(path.join(web, "components", file), "utf8")))).join("\n");

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const base = { subtotal: 706000, discount: 0, tax: 0, taxRate: null, taxMethod: "STANDARD", total: 706000, amountPaid: 706000, change: 0, status: "COMPLETED", paymentMethod: "CASH" };
  const rows = {
    "tax-1": { ...base, id: "tax-1" },
    "draft-tax": { ...base, id: "draft-tax", status: "DRAFT", amountPaid: 0 },
    "final-dpp": { ...base, id: "final-dpp", taxRate: 12, taxMethod: "DPP_NILAI_LAIN", tax: 77660, total: 783660 },
    "discount-regular": { ...base, id: "discount-regular", subtotal: 100000, discount: 10000, total: 90000, amountPaid: 90000 },
    "discount-draft": { ...base, id: "discount-draft", discount: 106000, total: 600000, amountPaid: 0, status: "DRAFT" },
  };
  const persistedOutcomes = {
    "tax-1:12": { taxRate: 12, taxMethod: "STANDARD", tax: 84720, total: 790720, status: "DP" },
    "tax-1:0": { taxRate: 0, taxMethod: "STANDARD", tax: 0, total: 706000, status: "COMPLETED" },
    "draft-tax:12": { taxRate: 12, taxMethod: "DPP_NILAI_LAIN", tax: 77660, total: 783660 },
    "discount-regular:12.5": { taxRate: 12.5, taxMethod: "STANDARD", tax: 11250, total: 101250, status: "DP" },
    "discount-draft:12": { taxRate: 12, taxMethod: "DPP_NILAI_LAIN", tax: 66000, total: 666000 },
    "discount-draft:12.5": { taxRate: 12.5, taxMethod: "DPP_NILAI_LAIN", tax: 68750, total: 668750 },
    "discount-draft:0": { taxRate: 0, taxMethod: "DPP_NILAI_LAIN", tax: 0, total: 600000 },
  };
  let failSave = false;
  let failLoad = false;
  let writes = 0;
  let delay;
  await page.route("http://localhost:3004/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>' });
    if (url.pathname === "/api/settings/store") return route.fulfill({ json: { name: "Toko Teladan" } });
    if (url.pathname.endsWith("/document-item-names")) return route.fulfill({ json: { items: [] } });
    if (url.pathname.endsWith("/draft-number")) return route.fulfill({ json: { draftNumber: "PNW-TLD-20261018-001", automaticNumber: "PNW-TLD-20261018-001" } });
    const match = url.pathname.match(/^\/api\/transactions\/([^/]+)\/tax$/);
    if (match) {
      const row = rows[match[1]];
      if (route.request().method() === "PATCH") {
        writes++;
        if (delay) await delay;
        if (failSave) return route.fulfill({ status: 409, json: { message: "Transaksi berubah. Silakan buka kembali nota." } });
        const payload = route.request().postDataJSON();
        const { total, tax, taxRate, taxMethod, amountPaid, change, status } = row;
        assert.deepEqual(payload.expected, { total, tax, taxRate, taxMethod, amountPaid, change, status }, "the edit must send the loaded concurrency snapshot");
        const outcome = persistedOutcomes[`${row.id}:${payload.taxRate}`];
        assert.ok(outcome, `unexpected persisted edit: ${row.id}:${payload.taxRate}`);
        Object.assign(row, outcome);
      } else if (failLoad) return route.fulfill({ status: 503, json: { message: "Pajak belum dapat dimuat." } });
      const { total, tax, taxRate, taxMethod, amountPaid, change, status } = row;
      return route.fulfill({ json: { transaction: row, snapshot: { total, tax, taxRate, taxMethod, amountPaid, change, status } } });
    }
    return route.fulfill({ status: 404, body: "Unknown fixture" });
  });
  await page.goto("http://localhost:3004/fixture");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.addStyleTag({ content: printStyles });
  await page.getByRole("button", { name: "Buka biasa", exact: true }).click();
  const regular = page.getByLabel("Pajak (%)", { exact: true });
  await regular.waitFor();
  await page.waitForFunction(() => !document.querySelector('[name="taxRate"]').disabled);
  await regular.fill("12");
  assert.match(await page.locator("#print-receipt").innerText(), /12%/);
  assert.match(await page.locator("#print-receipt").innerText(), /790\.720/);
  const taxRow = page.locator("#print-receipt").getByText("Pajak", { exact: true }).locator("..");
  assert.doesNotMatch(await taxRow.innerText(), /84\.720/);
  let release;
  delay = new Promise(resolve => { release = resolve; });
  await page.getByRole("button", { name: "Cetak Invoice", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Cetak", exact: true }).count(), 0, "print settings must wait for persistence");
  release(); delay = undefined;
  await page.getByRole("button", { name: "Cetak", exact: true }).click();
  await page.waitForFunction(() => window.prints.length === 1);
  assert.match(await page.evaluate(() => window.prints[0]), /12%/);
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await page.getByRole("button", { name: "Buka biasa", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[name="taxRate"]').value === "12" && !document.querySelector('[name="taxRate"]').disabled);
  assert.equal(await regular.inputValue(), "12", "reopen must read the saved rate despite stale parent props");
  await page.getByRole("button", { name: "Tutup", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Buka penawaran", exact: true }).click();
  const ppn = page.getByLabel("PPN (%)", { exact: true });
  await page.waitForFunction(() => !document.querySelector('[name="taxRate"]').disabled);
  await ppn.fill("101");
  assert.equal(await page.getByRole("button", { name: "Cetak Nota Penawaran", exact: true }).isDisabled(), true);
  await ppn.fill("12");
  const preview = page.locator("#draft-receipt-page");
  assert.match(await preview.innerText(), /DPP Nilai Lain\s+Rp 647\.167/);
  assert.match(await preview.innerText(), /PPN\s+Rp 77\.660/);
  failSave = true;
  await page.getByRole("button", { name: "Cetak Nota Penawaran", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Transaksi berubah" }).first().waitFor();
  assert.equal(await page.evaluate(() => window.prints.length), 1, "failed persistence must prevent printing");
  assert.equal(await ppn.inputValue(), "12", "retain unsaved input on error");
  assert.equal(await page.getByRole("button", { name: "Cetak Nota Penawaran", exact: true }).isDisabled(), false, "a save failure must allow retry without editing the rate");
  failSave = false;
  await page.getByRole("button", { name: "Cetak Nota Penawaran", exact: true }).click();
  await page.waitForFunction(() => window.prints.length === 2);
  assert.match(await page.evaluate(() => window.prints[1]), /77\.660/);
  assert.equal(writes, 3);
  process.stdout.write("PASS: baseline previews, save-before-print, reload, retry, and mobile input\n");
  await page.getByRole("button", { name: "Tutup", exact: true }).click();

  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.getByRole("button", { name: "Buka diskon biasa", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[name="taxRate"]').value === "0" && !document.querySelector('[name="taxRate"]').disabled);
  await regular.fill("12.5");
  assert.match(await page.locator("#print-receipt").innerText(), /12,5%/);
  assert.match(await page.locator("#print-receipt").innerText(), /101\.250/);

  // Changing the transaction while the modal stays mounted must discard the
  // previous transaction's unsaved rate and preserve the saved DPP method.
  await page.getByRole("button", { name: "Buka DPP selesai", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[name="taxRate"]').value === "12" && !document.querySelector('[name="taxRate"]').disabled);
  assert.match(await page.locator("#print-receipt").innerText(), /12%/);
  assert.doesNotMatch(await page.locator("#print-receipt").innerText(), /11%/);
  assert.match(await page.locator("#print-receipt").innerText(), /783\.660/);
  assert.equal(writes, 3, "switching documents must not save the discarded edit");
  process.stdout.write("PASS: finalized DPP rate and transaction switching\n");
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await page.getByRole("button", { name: "Buka diskon biasa", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[name="taxRate"]').value === "0" && !document.querySelector('[name="taxRate"]').disabled);

  const regularPrint = page.getByRole("button", { name: "Cetak Invoice", exact: true });
  for (const invalid of ["", "-0.01", "100.01", "12.345"]) {
    await regular.fill(invalid);
    assert.equal(await regularPrint.isDisabled(), true, `regular rate ${JSON.stringify(invalid)} must block print`);
    assert.equal(await page.getByRole("button", { name: "Simpan Pajak", exact: true }).isDisabled(), true);
    assert.equal(writes, 3, "invalid input must not reach persistence");
  }
  await regular.fill("12.5");
  delay = new Promise(resolve => { release = resolve; });
  const saving = page.waitForRequest(request => request.method() === "PATCH" && request.url().includes("discount-regular/tax"));
  await regularPrint.evaluate(button => { button.click(); button.click(); });
  await saving;
  assert.equal(writes, 4, "double click must issue one tax save");
  assert.equal(await regular.isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Cetak", exact: true }).count(), 0);
  release(); delay = undefined;
  await page.getByRole("button", { name: "Cetak", exact: true }).click();
  await page.waitForFunction(() => window.prints.length === 3);
  assert.match(await page.evaluate(() => window.prints[2]), /12,5%/);
  assert.match(await page.evaluate(() => window.prints[2]), /101\.250/);
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  await page.emulateMedia({ media: "print" });
  assert.equal(await regular.isVisible(), false, "the tax editor must be hidden on printed regular receipts");
  assert.equal(await page.locator("#print-receipt").isVisible(), true);
  await page.emulateMedia({ media: "screen" });
  process.stdout.write("PASS: regular discount, decimal rate, validation, duplicate click, and print controls\n");
  await page.getByRole("button", { name: "Tutup", exact: true }).click();

  await page.getByRole("button", { name: "Buka diskon penawaran", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[name="taxRate"]').disabled);
  for (const invalid of ["", "-1", "100.01", "12.345"]) {
    await ppn.fill(invalid);
    assert.equal(await page.getByRole("button", { name: "Cetak Nota Penawaran", exact: true }).isDisabled(), true, `quotation rate ${JSON.stringify(invalid)} must block print`);
  }
  await ppn.fill("12");
  assert.match(await preview.innerText(), /DPP Nilai Lain\s+Rp 550\.000/);
  assert.match(await preview.innerText(), /PPN\s+Rp 66\.000/);
  assert.match(await preview.innerText(), /666\.000/);
  delay = new Promise(resolve => { release = resolve; });
  const savingQuotation = page.waitForRequest(request => request.method() === "PATCH" && request.url().includes("discount-draft/tax"));
  await page.getByRole("button", { name: "Cetak Nota Penawaran", exact: true }).evaluate(button => { button.click(); button.click(); });
  await savingQuotation;
  assert.equal(writes, 5, "double click must issue one quotation tax save");
  assert.equal(await page.evaluate(() => window.prints.length), 3, "quotation print must wait for the save response");
  release(); delay = undefined;
  await page.waitForFunction(() => window.prints.length === 4);
  assert.match(await page.evaluate(() => window.prints[3]), /66\.000/);
  await page.emulateMedia({ media: "print" });
  assert.equal(await ppn.isVisible(), false, "the PPN editor must be hidden on printed quotations");
  assert.equal(await preview.isVisible(), true);
  await page.emulateMedia({ media: "screen" });
  process.stdout.write("PASS: quotation discount, validation, duplicate click, and print controls\n");
  await ppn.fill("12.5");
  assert.match(await preview.innerText(), /DPP Nilai Lain\s+Rp 550\.000/);
  assert.match(await preview.innerText(), /PPN\s+Rp 68\.750/);
  assert.match(await preview.innerText(), /668\.750/);
  const savedDecimalQuotation = page.waitForResponse(response => response.request().method() === "PATCH" && response.url().includes("discount-draft/tax"));
  await page.getByRole("button", { name: "Simpan Pajak", exact: true }).click();
  await savedDecimalQuotation;
  await page.waitForFunction(() => !document.querySelector('[name="taxRate"]').disabled);
  assert.equal(rows["discount-draft"].taxRate, 12.5);
  await ppn.fill("");
  assert.equal(await page.getByRole("button", { name: "Cetak Nota Penawaran", exact: true }).isDisabled(), true);
  await ppn.fill("0");
  await page.getByRole("button", { name: "Cetak Nota Penawaran", exact: true }).click();
  await page.waitForFunction(() => window.prints.length === 5);
  assert.match(await page.evaluate(() => window.prints[4]), /DPP Nilai Lain\s*Rp 550\.000/);
  assert.match(await page.evaluate(() => window.prints[4]), /PPN\s*Rp 0\s*Total\s*Rp 600\.000/);
  assert.match(await page.evaluate(() => window.prints[4]), /600\.000/);
  assert.equal(rows["discount-draft"].taxRate, 0);
  assert.equal(writes, 7);
  await page.getByRole("button", { name: "Tutup", exact: true }).click();

  await page.getByRole("button", { name: "Buka biasa", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[name="taxRate"]').value === "12" && !document.querySelector('[name="taxRate"]').disabled);
  await regular.fill("");
  assert.equal(await regularPrint.isDisabled(), true, "clearing the rate is invalid until zero is entered explicitly");
  await regular.fill("0");
  assert.match(await page.locator("#print-receipt").innerText(), /0%/);
  assert.match(await page.locator("#print-receipt").innerText(), /706\.000/);
  const savedZero = page.waitForResponse(response => response.request().method() === "PATCH" && response.url().includes("tax-1/tax"));
  await page.getByRole("button", { name: "Simpan Pajak", exact: true }).click();
  await savedZero;
  await page.waitForFunction(() => !document.querySelector('[name="taxRate"]').disabled);
  assert.equal(rows["tax-1"].taxRate, 0, "explicit zero must be persisted rather than replaced by a default rate");
  assert.equal(writes, 8);
  await page.getByRole("button", { name: "Tutup", exact: true }).click();

  // SALES has read access to regular transactions and quotations without update.
  for (const [button, label, expectedRate, printButton, expectedPrinted] of [
    ["Lihat biasa", "Pajak (%)", "0", "Cetak Invoice", /0%/],
    ["Lihat penawaran", "PPN (%)", "12", "Cetak Nota Penawaran", /77\.660/],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await page.waitForFunction(rate => document.querySelector('[name="taxRate"]').value === rate && !document.body.textContent.includes("Memuat pajak tersimpan"), expectedRate);
    assert.equal(await page.getByLabel(label, { exact: true }).isDisabled(), true, "view-only users cannot edit the loaded rate");
    assert.equal(await page.getByRole("button", { name: "Simpan Pajak", exact: true }).count(), 0);
    const previousPrints = await page.evaluate(() => window.prints.length);
    await page.getByRole("button", { name: printButton, exact: true }).click();
    if (printButton === "Cetak Invoice") await page.getByRole("button", { name: "Cetak", exact: true }).click();
    await page.waitForFunction(count => window.prints.length === count + 1, previousPrints);
    assert.match(await page.evaluate(() => window.prints.at(-1)), expectedPrinted);
    if (printButton === "Cetak Invoice") await page.getByRole("button", { name: "Batal", exact: true }).click();
    assert.equal(writes, 8, "printing a view-only receipt must not PATCH tax");
    await page.getByRole("button", { name: "Tutup", exact: true }).click();
  }

  failLoad = true;
  await page.getByRole("button", { name: "Buka penawaran", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Pajak belum dapat dimuat" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Cetak Nota Penawaran", exact: true }).isDisabled(), true);
  assert.deepEqual(errors, []);
  process.stdout.write("PASS: regular/quotation percentages and rupiah, saved DPP method, discounts, decimal/zero rates, transaction switching, blank/range validation, save-before-print, retry, duplicate-click guard, view-only printing, hidden print controls, load failure, and mobile input\n");
} finally { await browser.close(); }
