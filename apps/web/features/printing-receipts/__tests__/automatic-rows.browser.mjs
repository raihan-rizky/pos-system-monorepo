import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repo = process.cwd();
const web = path.join(repo, "apps/web");
const require = createRequire(path.join(web, "package.json"));
const esbuild = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium, expect } = require("@playwright/test");
const bundle = await esbuild.build({
  stdin: { contents: `
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {PrintingReceiptView} from './features/printing-receipts/components/PrintingReceiptView';
    import {createPrintingReceiptPdf} from './features/printing-receipts/export-pdf';
    function Harness(){
      const [receipt,setReceipt]=useState(null);
      const [editable,setEditable]=useState(true);
      window.setReceipt=setReceipt;window.setEditable=setEditable;window.currentReceipt=receipt;
      window.exportPdf=async()=>{const pdf=await createPrintingReceiptPdf(receipt);return {bytes:Array.from(new Uint8Array(pdf.output('arraybuffer'))),pages:pdf.getNumberOfPages()};};
      return <main className="printing-receipt-viewport">{receipt&&<PrintingReceiptView receipt={receipt} editable={editable} onChange={setReceipt}/>}</main>;
    }
    createRoot(document.getElementById('root')).render(<Harness/>);
  `, resolveDir: web, loader: "tsx" },
  bundle: true, write: false, outfile: "automatic-rows.js", platform: "browser", format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0}main{width:100vw;height:100dvh}${bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? ""}</style></head><body><div id="root"></div><script>${bundle.outputFiles.find(file => file.path.endsWith(".js")).text}</script></body></html>`;
const item = (id, name = "Cetak contoh") => ({ id: String(id), name, material: "", quantity: 2, price: 15000, stockLink: null });
const receipt = (subcategory, lines) => ({
  id: "automatic-rows", storeId: "store", number: "NOTA-CONTOH", revision: 1, subcategory, transactionId: null,
  createdAt: "2026-10-21", updatedAt: "2026-10-21",
  document: { customerName: "", customerPhone: "", customerId: null, date: "2026-10-21", note: "",
    completionDate: "", completionTime: "", receiver: "", setter: "", signatory: "", lines },
});
const output = path.join(repo, "output/playwright/automatic-receipt-rows");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const viewportWidth of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width: viewportWidth, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/images/printing-receipts/")) return route.fulfill({ contentType: "image/png", body: await readFile(path.join(web, "public", url.pathname)) });
      return route.fulfill({ contentType: "text/html", body: html });
    });
    await page.goto("http://localhost:4378/");
    await page.waitForFunction(() => Boolean(window.setReceipt));
    for (const subcategory of ["SPANDUK", "PRINT"]) {
      const count = subcategory === "SPANDUK" ? 6 : 13;
      for (const scenario of ["full", "tall"]) {
        const blank = id => ({ ...item(id, ""), material: "", quantity: null, price: null });
        const filled = scenario === "full"
          ? [...Array.from({length: count}, (_, index) => ({...item(index + 1), material: ""})), blank(count + 1)]
          : [{...item(1, Array.from({length: subcategory === "SPANDUK" ? 9 : 24}, () => "Cetak").join("\n")), material: ""}, ...Array.from({length: count - 1}, (_, index) => blank(index + 2))];
        const nextNumber = scenario === "full" ? count + 1 : 2;
        for (const field of ["name", "material"]) {
          const stagedRecord = receipt(subcategory, filled);
          await page.evaluate(record => { window.setEditable(true); window.setReceipt(record); }, stagedRecord);
          await expect(page.locator("[data-receipt-page]")).toHaveCount(1);
          const stage = page.locator("[data-receipt-next-line]");
          await expect(stage).toHaveCount(1);
          assert.equal(await stage.evaluate(element => element.closest("[data-receipt-page]") === null), true);
          const pdfBefore = await page.evaluate(() => window.exportPdf());
          assert.equal(pdfBefore.pages, 1, "Blank entry must not create a PDF page");
          const label = `${field === "name" ? "Nama item" : "Bahan"} baris ${nextNumber}`;
          const entry = page.getByLabel(label, { exact: true });
          await entry.fill("Baris lanjutan");
          await expect(page.locator("[data-receipt-page]")).toHaveCount(2);
          await expect(entry).toBeFocused();
          assert.equal(await entry.evaluate(element => element.closest("[data-receipt-page]") !== null), true, "Focus transfers from staged entry to measured page");
          assert.equal(await entry.evaluate(element => element.selectionStart), "Baris lanjutan".length);
          await entry.pressSequentially(" utuh");
          await expect(entry).toHaveValue("Baris lanjutan utuh");
          assert.equal(await page.evaluate(({index,field}) => window.currentReceipt.document.lines[index][field], {index: nextNumber - 1, field}), "Baris lanjutan utuh");
          await page.evaluate(() => window.setEditable(false));
          await expect(stage).toHaveCount(0);
          assert.equal((await page.evaluate(() => window.exportPdf())).pages, 2);
        }
      }
      const draft = receipt(subcategory, [item(1), ...Array.from({ length: count - 1 }, (_, index) => ({ ...item(index + 2, ""), quantity: null, price: null }))]);
      await page.evaluate(record => { window.setEditable(true); window.setReceipt(record); }, draft);
      const name = page.getByLabel("Nama item baris 1", { exact: true });
      await name.waitFor();
      const shortHeight = await name.evaluate(element => element.getBoundingClientRect().height);
      const text = "Spanduk promosi pembukaan toko cabang Jakarta ukuran tiga kali satu meter ".repeat(3).trim();
      await name.fill(text);
      await expect(page.locator("svg[data-receipt-table]")).toHaveCount(1);
      await expect(page.locator("[data-receipt-page]")).toHaveCount(1);
      await expect(name).toBeFocused();
      assert.ok(await name.evaluate(element => element.getBoundingClientRect().height) > shortHeight);
      assert.equal(await name.evaluate(element => element.scrollHeight <= element.clientHeight + 1), true, "Nama harus muat pada tinggi textarea");
      assert.equal(await page.getByLabel(/Lampiran nota/).count(), 0);
      assert.equal(await page.evaluate(() => window.currentReceipt.document.lines.length), count, "Baris tersimpan harus tetap utuh");
      const innerLines = await name.evaluate(element => {
        const sheet = element.closest("[data-receipt-page]");
        const top = Number.parseFloat(element.style.top) / 4;
        const bottom = top + Number.parseFloat(element.style.height) / 4;
        return [...sheet.querySelectorAll("svg[data-receipt-table] line")].filter(line => {
          const y1 = Number(line.getAttribute("y1"));
          return y1 === Number(line.getAttribute("y2")) && y1 > top + .3 && y1 < bottom - .3;
        }).length;
      });
      assert.equal(innerLines, 0, "Tidak boleh ada garis horizontal di tengah nama");
      await name.fill("1".repeat(240));
      await expect(name).toBeFocused();
      assert.equal(await name.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, "Nama tanpa spasi harus membungkus");
      assert.equal(await name.evaluate(element => element.scrollHeight <= element.clientHeight + 1), true, "Nama tanpa spasi harus muat vertikal");
      await name.fill("Pendek");
      assert.equal(await name.evaluate(element => element.getBoundingClientRect().height), shortHeight);
      await expect(page.getByLabel(`Nama item baris ${count}`, { exact: true })).toHaveCount(1);

      const full = receipt(subcategory, Array.from({ length: count }, (_, index) => item(index + 1)));
      await page.evaluate(record => window.setReceipt(record), full);
      const last = page.getByLabel(`Nama item baris ${count}`, { exact: true });
      await last.fill(text);
      await expect(page.locator("[data-receipt-page]")).toHaveCount(2);
      await expect(last).toBeFocused();
      await expect(last).toHaveValue(text);
      assert.equal(await last.evaluate(element => element.selectionStart), text.length, "Caret harus dipertahankan saat pindah halaman");
      await last.pressSequentially(" TAMBAHAN");
      await expect(last).toHaveValue(`${text} TAMBAHAN`);
      await last.fill("Pendek");
      await expect(page.locator("[data-receipt-page]")).toHaveCount(1);
      await expect(last).toBeFocused();
      const price = page.getByLabel(`Harga satuan baris ${count}`, { exact: true });
      await price.fill("17500");
      await expect(price).toBeFocused();
      await expect(price).toHaveValue("17500");

      const extreme = receipt(subcategory, [{ ...item(1, "Nama sangat panjang tanpa terpotong ".repeat(240)), material: "Flexi contoh" }]);
      await page.evaluate(record => window.setReceipt(record), extreme);
      const fragments = page.getByLabel("Nama item baris 1", { exact: true });
      assert.ok(await fragments.count() > 1, "Nama ekstrem harus berlanjut pada lembar nota berikutnya");
      assert.equal(await fragments.evaluateAll(elements => elements.filter(element => element.tagName === "TEXTAREA").length), 1, "Hanya fragmen nama pertama yang dapat disunting");
      assert.equal(await page.getByLabel("Banyaknya baris 1", { exact: true }).count(), 1, "Nilai pendamping hanya tampil sekali");
      if (subcategory === "PRINT") {
        const editableMaterial = page.locator('textarea[aria-label="Bahan baris 1"]');
        await expect(editableMaterial).toHaveCount(1);
        assert.ok(await editableMaterial.evaluate(element => [...document.querySelectorAll("[data-receipt-page]")].indexOf(element.closest("[data-receipt-page]"))) > 0,
          "Bahan pertama tetap dapat disunting pada halaman setelah kelanjutan nama");
      }
      await page.evaluate(() => window.setEditable(false));
      const completeName = await fragments.allTextContents();
      assert.equal(completeName.join("").replace(/\s/g, ""), extreme.document.lines[0].name.replace(/\s/g, ""), "Seluruh fragmen nama harus tetap utuh");
      assert.equal(await fragments.evaluateAll(elements => elements.every(element => getComputedStyle(element).whiteSpace === "pre")), true,
        "Preview hanya memakai pemisah baris dari perhitungan bersama PDF");
      assert.equal(await page.getByLabel(/Lampiran nota/).count(), 0);

      const longMaterial = receipt(subcategory, [{ ...item(1, "Nama cetakan contoh ".repeat(8)), material: "Bahan contoh ".repeat(subcategory === "SPANDUK" ? 2 : 6) }, item(2)]);
      await page.evaluate(record => { window.setEditable(true); window.setReceipt(record); }, longMaterial);
      const firstName = page.getByLabel("Nama item baris 1", { exact: true });
      const material = page.getByLabel("Bahan baris 1", { exact: true });
      if (subcategory === "PRINT") {
        const nameBox = await firstName.boundingBox();
        const materialBox = await material.boundingBox();
        const secondBox = await page.getByLabel("Nama item baris 2", { exact: true }).boundingBox();
        assert.ok(materialBox.y >= nameBox.y + nameBox.height - .1);
        assert.ok(secondBox.y >= materialBox.y + materialBox.height - .1);
      }
      await page.evaluate(() => window.setEditable(false));
      await expect(page.locator("textarea")).toHaveCount(0);
      const readonly = page.getByLabel("Nama item baris 1", { exact: true });
      assert.equal((await readonly.innerText()).replace(/\s/g, ""), longMaterial.document.lines[0].name.replace(/\s/g, ""));
      assert.equal(await readonly.evaluate(element => element.scrollHeight <= element.clientHeight + 1), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Layar HP tidak boleh meluber horizontal");
      await page.screenshot({ path: path.join(output, `${subcategory.toLowerCase()}-${viewportWidth}.png`) });
      if (viewportWidth === 1280) {
        const exported = await page.evaluate(() => window.exportPdf());
        assert.equal(exported.pages, await page.locator("[data-receipt-page]").count(), "PDF dan preview harus sama jumlah halamannya");
        await writeFile(path.join(output, `${subcategory.toLowerCase()}-contoh.pdf`), Buffer.from(exported.bytes));
      }
      process.stdout.write(`PASS ${subcategory} ${viewportWidth}px: wrap, spare rows, grid, focus/caret across pages, material, readonly\n`);
    }
    if (viewportWidth === 1280) {
      const screenshotRecord = receipt("SPANDUK", [
        { ...item(1, "Spanduk Promosi Pembukaan Toko Cabang Jakarta\nUkuran 3 × 1 Meter"), material: "Flexi", quantity: null, price: null },
        { ...item(2, "Banner Kasir"), material: "Flexi", quantity: null, price: null },
        { ...item(3, "Stiker Logo"), material: "Vinyl", quantity: null, price: null },
      ]);
      screenshotRecord.transactionId = "transaksi-contoh";
      await page.evaluate(record => { window.setEditable(false); window.setReceipt(record); }, screenshotRecord);
      await page.getByText("Banner Kasir", { exact: true }).waitFor();
      const grid = await page.locator("svg[data-receipt-table]").boundingBox();
      await page.screenshot({ path: path.join(output, "nota-baris-otomatis.png"), clip: { x: Math.max(0, grid.x - 2), y: grid.y - 25, width: grid.width + 4, height: grid.height + 29 } });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
