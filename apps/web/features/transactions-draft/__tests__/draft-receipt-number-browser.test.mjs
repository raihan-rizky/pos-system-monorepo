import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { bundleReactHarness, web } from "../../product-stock-groups/__tests__/browser-harness.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const bundle = await bundleReactHarness(`
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
    import {RoleProvider} from './components/providers/RoleProvider';
    import {buildDefaultRolePermissions} from './features/rbac/helpers/rbac-core';
    const authorizationFingerprint = "quotation-test-permissions";
    const permissions = buildDefaultRolePermissions();
    import {DraftReceiptModal} from './components/DraftReceiptModal';
    import './components/receipt-print.css';
    import './features/surat-jalan/components/surat-jalan-print.css';
    const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
    const item={id:'item-1',productName:'Kertas warna',quantity:2,unitPrice:5000,subtotal:10000,product:{unit:'pak'}};
    const transaction={id:'draft-1',draftNumber:'PNW-TLD-20261018-003',status:'DRAFT',total:10000,items:[item],customerName:'PT Contoh',createdAt:'2026-10-18T03:00:00Z'};
    window.prints=[];
    window.print=()=>window.prints.push(document.querySelector('#draft-receipt-page').textContent);
    function Harness(){
      const [open,setOpen]=useState(false);
      const [role,setRole]=useState('OWNER');
      window.quotationTestAccess = { user: { id: 'owner', name: 'Owner', role, storeId: null }, authorizationFingerprint, permissions };
      return <QueryClientProvider client={client}><RoleProvider role={role} userId="owner" userName="Owner" authorizationFingerprint={authorizationFingerprint}>
        <button onClick={()=>setOpen(true)}>Buka cetak</button>
        <button onClick={()=>setRole('SALES')}>Pakai Sales</button>
        <button onClick={()=>setRole('OWNER')}>Pakai Owner</button>
        <DraftReceiptModal open={open} onClose={()=>setOpen(false)} transaction={transaction}/>
      </RoleProvider></QueryClientProvider>;
    }
    createRoot(document.getElementById('root')).render(<Harness/>);
`, ["components/DraftReceiptModal.tsx", "components/PrintItemTable.tsx", "../../packages/ui/src/Modal.tsx"]);

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const output = process.env.POS_PRINT_ARTIFACTS_DIR;
  if (output) await mkdir(output, { recursive: true });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let saved = "PNW-TLD-20261018-003";
  let failSave = false;
  let failLoad = false;
  let writes = 0;
  let delaySave;
  let savedQuotationItems = [];
  let postedQuotationItems;
  await page.route("http://localhost:3004/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="id"><body><div id="root"></div></body></html>' });
    if (url.pathname === "/images/kop-surat-header.png") return route.fulfill({ contentType: "image/png", body: await readFile(path.join(web, "public/images/kop-surat-header.png")) });
    if (url.pathname.startsWith("/fonts/print/")) return route.fulfill({ contentType: "font/woff2", body: await readFile(path.join(web, "public/fonts/print", path.basename(url.pathname))) });
    if (url.pathname === "/api/auth/permissions") return route.fulfill({ json: await page.evaluate(() => window.quotationTestAccess) });
    if (url.pathname === "/api/settings/store") return route.fulfill({ json: { name: "Toko Teladan" } });
    if (url.pathname.endsWith("/document-item-names")) return route.fulfill({ json: { items: [{ id: "item-1", productName: "Kertas warna", documentName: null }] } });
    if (url.pathname.endsWith("/quotation-items")) {
      if (route.request().method() === "GET") return route.fulfill({ json: { items: savedQuotationItems } });
      postedQuotationItems = route.request().postDataJSON().items;
      savedQuotationItems = postedQuotationItems.map(entry => ({
        ...entry, productName: entry.productId ? "Kertas katalog" : entry.name, documentName: entry.name,
        quotationUnit: entry.unit, subtotal: entry.quantity * entry.unitPrice, size: null, material: null,
      }));
      const total = 10000 + savedQuotationItems.reduce((sum, entry) => sum + entry.subtotal, 0);
      const snapshot = { total, tax: 0, taxRate: null, taxMethod: "STANDARD", amountPaid: 0, change: 0, status: "DRAFT" };
      return route.fulfill({ json: { items: savedQuotationItems, tax: { transaction: { ...snapshot, id: "draft-1", subtotal: total, discount: 0, paymentMethod: "CASH" }, snapshot } } });
    }
    if (url.pathname === "/api/products") return route.fulfill({ json: { data: [{ id: "paper", name: "Kertas katalog", unit: "pak", price: 1000 }] } });
    if (url.pathname === "/api/transactions/draft-1/tax") {
      const total = 10000 + savedQuotationItems.reduce((sum, entry) => sum + entry.subtotal, 0);
      const snapshot = { total, tax: 0, taxRate: null, taxMethod: "STANDARD", amountPaid: 0, change: 0, status: "DRAFT" };
      return route.fulfill({ json: { transaction: { ...snapshot, id: "draft-1", subtotal: total, discount: 0, paymentMethod: "CASH" }, snapshot } });
    }
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
  await page.addStyleTag({ content: bundle.css });
  await page.addScriptTag({ content: bundle.script });
  const open = () => page.getByRole("button", { name: "Buka cetak", exact: true }).click();
  const print = () => page.getByRole("button", { name: "Cetak Nota Penawaran", exact: true }).click();
  const number = page.getByLabel("No. Faktur", { exact: true });
  const close = () => page.getByRole("button", { name: "Tutup", exact: true }).click();
  await open();
  await page.waitForFunction(() => !document.querySelector('[name="draftNumber"]').disabled);
  assert.equal(await number.inputValue(), "003/PNW-TLD/18/X/2026");
  const receipt = page.locator("#draft-receipt-page");
  const itemsTable = receipt.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "ITEM", exact: true }) });
  const addBlankRow = receipt.getByRole("button", { name: "Tambah baris kosong" });
  const itemRows = itemsTable.locator("tbody > tr");
  const classicPaper = await receipt.evaluate(element => {
    const style = getComputedStyle(element);
    return { width: parseFloat(style.width), inset: parseFloat(style.paddingInlineStart), font: style.fontFamily };
  });
  assert.ok(Math.abs(classicPaper.width - 210 * 96 / 25.4) < 1, "preview retains the classic A4 paper width");
  assert.ok(Math.abs(classicPaper.inset - 16 * 96 / 25.4) < 1, "preview retains the original paper inset");
  assert.match(classicPaper.font, /Times New Roman/);
  const headerStyle = await itemsTable.getByRole("columnheader", { name: "ITEM" }).evaluate(element => {
    const style = getComputedStyle(element);
    return { font: style.fontFamily, size: style.fontSize, fill: style.backgroundColor };
  });
  assert.match(headerStyle.font, /Times New Roman/);
  assert.equal(headerStyle.size, "11px");
  assert.equal(headerStyle.fill, "rgb(240, 240, 240)");
  assert.deepEqual(await itemsTable.getByRole("columnheader").allTextContents(), ["NO", "ITEM", "QUANTITAS", "SATUAN", "HARGA SATUAN", "TOTAL HARGA"]);
  const quantityHeader = itemsTable.getByRole("columnheader", { name: "QUANTITAS", exact: true });
  assert.equal(await quantityHeader.evaluate(cell => {
    const range = document.createRange();
    range.selectNodeContents(cell);
    return range.getClientRects().length;
  }), 1, "the classic quantity heading should stay on one line");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const scroller = page.getByRole("region", { name: "Pratinjau Nota Penawaran", exact: true });
    assert.equal(await scroller.evaluate(element => element.scrollWidth > element.clientWidth && document.documentElement.scrollWidth <= innerWidth), true, `A4 scrolling stays inside the modal at ${width}px`);
    await addBlankRow.scrollIntoViewIfNeeded();
    const button = await addBlankRow.boundingBox();
    const preview = await scroller.boundingBox();
    assert.equal(Math.round(button.width), 44);
    assert.ok(button.x >= preview.x - 1 && button.x + button.width <= preview.x + preview.width + 1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const total = await receipt.getByText("Total", { exact: true }).locator("..").innerText();
  await addBlankRow.click();
  await addBlankRow.press("Enter");
  assert.equal(await itemRows.count(), 3);
  assert.deepEqual(await itemRows.last().locator("td").allTextContents(), ["", "", "", "", "", ""]);
  assert.equal(await receipt.getByText("Total", { exact: true }).locator("..").innerText(), total);
  const removeBlankRow = receipt.getByRole("button", { name: "Hapus baris kosong terakhir" });
  await removeBlankRow.press("Enter");
  assert.equal(await itemRows.count(), 2);
  await page.emulateMedia({ media: "print" });
  assert.equal(await addBlankRow.isVisible(), false);
  assert.equal(await itemRows.last().isVisible(), true);
  assert.equal(await page.getByRole("dialog").evaluate(dialog => getComputedStyle(dialog).animationName), "none", "opening the dialog must not fade the printed page");
  const backdrop = page.getByRole("dialog").locator("..").locator(":scope > .absolute");
  assert.equal(await backdrop.isVisible(), false, "the modal backdrop must be hidden on paper");
  await page.emulateMedia({ media: "screen" });
  if (output) {
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.screenshot({ path: path.join(output, "nota-penawaran-mobile.png") });
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await print();
  await page.waitForFunction(() => window.prints.length === 1);
  assert.equal(writes, 0, "printing the current number must not renumber it");
  assert.equal(postedQuotationItems, undefined, "untouched rows must print without being saved as items");

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
  assert.equal(await itemRows.count(), 1, "reopening starts with the standard print layout");
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
  await addBlankRow.evaluate(button => {
    for (let row = 0; row < 45; row++) button.click();
  });
  assert.equal(await itemRows.count(), 46);
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ path: output && path.join(output, "nota-penawaran-long.pdf"), preferCSSPageSize: true, printBackground: true });
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  await page.emulateMedia({ media: "screen" });
  const previousWrites = writes;
  await print();
  await page.waitForFunction(() => window.prints.length === 7);
  assert.equal(writes, previousWrites);
  await close();
  failLoad = true;
  await open();
  await page.getByRole("alert").filter({ hasText: "belum dapat dimuat" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Cetak Nota Penawaran", exact: true }).isDisabled(), true, "must not print stale parent numbers after a read failure");

  await close();
  failLoad = false;
  await page.getByRole("button", { name: "Pakai Owner", exact: true }).click();
  await open();
  await addBlankRow.click();
  const manualName = page.getByRole("textbox", { name: "Nama barang tambahan 1", exact: true });
  await manualName.waitFor({ timeout: 3000 });
  assert.equal(await manualName.evaluate(input => input === document.activeElement), true);
  const link = receipt.getByRole("button", { name: "Kaitkan dengan produk", exact: true });
  assert.equal(await link.count(), 0);
  await manualName.fill("Barang manual");
  await receipt.getByRole("textbox", { name: "Jumlah barang tambahan 1", exact: true }).fill("2");
  await receipt.getByRole("textbox", { name: "Satuan barang tambahan 1", exact: true }).fill("dus");
  await receipt.getByRole("textbox", { name: "Harga satuan barang tambahan 1", exact: true }).fill("1250");
  await addBlankRow.click();
  const linkedName = page.getByRole("textbox", { name: "Nama barang tambahan 2", exact: true });
  await linkedName.fill("Nama yang diketik");
  await receipt.getByRole("textbox", { name: "Jumlah barang tambahan 2", exact: true }).fill("3");
  await receipt.getByRole("textbox", { name: "Harga satuan barang tambahan 2", exact: true }).fill("1000");
  await link.last().click();
  await page.getByRole("textbox", { name: "Cari produk", exact: true }).fill("Kertas");
  await page.getByRole("button", { name: /Kertas katalog/ }).click();
  assert.equal(await linkedName.inputValue(), "Nama yang diketik");
  await addBlankRow.click();
  if (output) {
    await page.setViewportSize({ width: 1100, height: 960 });
    await receipt.evaluate(element => element.scrollIntoView({ block: "start", inline: "start" }));
    const paper = await receipt.boundingBox();
    const table = await itemsTable.boundingBox();
    await page.screenshot({
      path: path.join(output, "nota-penawaran-baris-manual.png"),
      clip: { x: paper.x, y: paper.y, width: paper.width, height: table.y + table.height + 26 - paper.y },
      animations: "disabled",
    });
  }
  const lastPrint = await page.evaluate(() => window.prints.length);
  await print();
  await page.waitForFunction(count => window.prints.length === count + 1, lastPrint);
  assert.deepEqual(postedQuotationItems.map(({ name, productId, unit, quantity, unitPrice }) => ({ name, productId, unit, quantity, unitPrice })), [
    { name: "Barang manual", productId: null, unit: "dus", quantity: 2, unitPrice: 1250 },
    { name: "Nama yang diketik", productId: "paper", unit: "pak", quantity: 3, unitPrice: 1000 },
  ]);
  assert.match(await page.evaluate(() => window.prints.at(-1)), /Nama yang diketik/);
  await page.emulateMedia({ media: "print" });
  assert.equal(await itemRows.count(), 4);
  assert.equal((await itemRows.last().innerText()).trim(), "");
  if (output) await page.pdf({ path: path.join(output, "nota-penawaran-manual-dan-kosong.pdf"), preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: "screen" });
  await close();
  await open();
  await page.waitForFunction(() => document.querySelector('#draft-receipt-page .total-row:last-child')?.textContent.includes('15.500'));
  assert.equal(await itemRows.count(), 3);
  assert.deepEqual(errors, []);
  process.stdout.write("PASS: blank print rows, manual quotation items, optional product links, save and reopen totals, draft numbering, and Sales permissions\n");
} finally {
  await browser.close();
}
