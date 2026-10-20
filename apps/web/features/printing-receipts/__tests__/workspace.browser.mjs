import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const repo = process.cwd();
const web = path.join(repo, "apps/web");
const require = createRequire(path.join(web, "package.json"));
const esbuild = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const loadConfig = require("tailwindcss/loadConfig");
const feature = path.join(web, "features/printing-receipts/components");
const fixtureModules = {
  "@/components/providers/RoleProvider": `
    import React,{createContext,useContext,useState} from 'react';
    const RoleContext=createContext(null);
    export const useRole=()=>useContext(RoleContext);
    export function HarnessRoleProvider({children}){
      const [state,setState]=useState({role:'ADMIN',userId:'user-a',storeId:'store',authorizationFingerprint:'same-role-permissions',allowed:['transaction:create','transaction:update','transaction:delete']});
      window.setHarnessRole=next=>setState(current=>({...current,...next}));
      return <RoleContext.Provider value={{...state,canPerform:(resource,action)=>state.allowed.includes(resource+':'+action)}}>{children}</RoleContext.Provider>;
    }`,
  "@/hooks/useProducts": `export function useProductsPage(search,category,options){const data=[{id:'flexi',name:'Flexi contoh',unit:'m²',stock:50,variants:[{id:'flexi-roll',unit:'rol',stock:2}]}];return {data:{data:search&&!'flexi contoh'.includes(search.toLowerCase())?[]:data,pagination:{page:1,totalPages:1}},isLoading:false,isError:false,isFetching:false,refetch:()=>{}};}`,
  "@/components/PaymentModal": `
    import React from 'react';
    export function PaymentModal(props){
      window.harnessPaymentItems=props.items;
      return <section role='dialog' aria-label='Pembayaran uji'><p>Konfirmasi pembayaran uji</p>{props.draftError&&<p role='alert'>{props.draftError}</p>}<button disabled={props.isProcessing} onClick={()=>props.onConfirm({customerName:'Pelanggan Contoh',customerId:null,paymentMethod:'CASH',amountPaid:20000,discount:0,tax:0,note:''})}>Konfirmasi uji</button><button onClick={props.onClose}>Batal pembayaran uji</button></section>;
    }`,
};

const bundle = await esbuild.build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {HarnessRoleProvider} from '@/components/providers/RoleProvider';import {PrintingReceiptWorkspace} from './features/printing-receipts/components/PrintingReceiptWorkspace';const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><HarnessRoleProvider><PrintingReceiptWorkspace/></HarnessRoleProvider></QueryClientProvider>);`, resolveDir: web, loader: "tsx" },
  bundle: true, write: false, outfile: "receipt-harness.js", platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web, "@pos/ui": path.join(repo, "packages/ui/src/index.ts") },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "fixtures", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => fixtureModules[args.path] ? { path: args.path, namespace: "fixture" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtureModules[args.path], loader: "tsx", resolveDir: web }));
  } }],
});
const source = (await Promise.all(["PrintingReceiptWorkspace.tsx", "PrintingReceiptView.tsx", "PrintingReceiptModal.tsx", "PrintingReceiptStockLinkModal.tsx"].map(file => readFile(path.join(feature, file), "utf8")))).join("\n");
const config = loadConfig(path.join(web, "tailwind.config.ts"));
const css = await postcss([tailwind({ ...config, content: [{ raw: source, extension: "tsx" }, path.join(repo, "packages/ui/src/**/*.{ts,tsx}")] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined });
const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>html,body{margin:0}#root{display:flex;height:100dvh;min-width:0}${css.css}\n${bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? ""}</style></head><body><div id="root"></div><script>${bundle.outputFiles.find(file => file.path.endsWith(".js")).text}</script></body></html>`;
const output = path.join(repo, "tmp/browser/printing-receipts");
await mkdir(output, { recursive: true });

const blankDocument = () => ({ customerName: "", customerPhone: "", customerId: null, date: "2026-10-20", note: "", completionDate: "", completionTime: "", receiver: "", setter: "", signatory: "", lines: [] });
const makeRecord = (id, subcategory, number, processed = false) => ({ id, storeId: "store", subcategory, number, revision: 1, transactionId: processed ? "sale" : null, ...(processed ? { transaction: { id: "sale", total: 75000, amountPaid: 25000, status: "COMPLETED" } } : {}), createdAt: "2026-10-20T01:00:00.000Z", updatedAt: "2026-10-20T01:00:00.000Z", document: { ...blankDocument(), customerName: "Pelanggan Contoh", lines: [{ id: `${id}-row`, name: "Cetak contoh", material: "Flexi", quantity: 1, price: 75000, stockLink: null }] } });

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const records = new Map([makeRecord("sp-existing", "SPANDUK", "SP-LAMA"), makeRecord("sp-processed", "SPANDUK", "SP-DIPROSES", true), makeRecord("print-existing", "PRINT", "PR-LAMA")].map(record => [record.id, record]));
    const calls = [];
    const errors = [];
    let counter = 0;
    let failSave = false;
    let failCheckout = false;
    let checkoutBody;
    let deferredRequest = null;
    const deferResponse = (method, id) => {
      let start;
      let release;
      const started = new Promise(resolve => { start = resolve; });
      const released = new Promise(resolve => { release = resolve; });
      deferredRequest = { method, id, start, released };
      return { started, release };
    };
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const body = request.postDataJSON();
      const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
      if (url.pathname.startsWith("/images/printing-receipts/")) return route.fulfill({ contentType: "image/png", body: await readFile(path.join(web, "public", url.pathname)) });
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
      calls.push({ path: url.pathname, method, body });
      if (deferredRequest?.method === method && url.pathname === (method === "POST" ? "/api/printing-receipts" : `/api/printing-receipts/${deferredRequest.id}`)) {
        const delayed = deferredRequest;
        deferredRequest = null;
        delayed.start();
        await delayed.released;
      }
      if (url.pathname === "/api/printing-receipts" && method === "GET") {
        const query = (url.searchParams.get("search") ?? "").toLowerCase();
        const data = [...records.values()].filter(record => record.subcategory === url.searchParams.get("subcategory") && (!query || `${record.number} ${record.document.customerName}`.toLowerCase().includes(query)));
        return json({ data, pagination: { page: 1, total: data.length, totalPages: 1 } });
      }
      if (url.pathname === "/api/printing-receipts" && method === "POST") {
        const record = { ...makeRecord(`created-${++counter}`, body.subcategory, `SP-UJI-${counter}`), document: blankDocument() };
        records.set(record.id, record); return json({ data: record }, 201);
      }
      if (url.pathname.startsWith("/api/printing-receipts/")) {
        const id = url.pathname.split("/").at(-1);
        const record = records.get(id);
        if (method === "GET") return json({ data: record });
        if (method === "PATCH") {
          if (failSave) return json({ error: "Simpan uji gagal. Coba lagi." }, 503);
          assert.equal(body.revision, record.revision);
          const next = { ...record, ...body, revision: record.revision + 1 };
          records.set(id, next); return json({ data: next });
        }
        if (method === "DELETE") { records.delete(id); return json({ success: true }); }
      }
      if (url.pathname === "/api/transactions" && method === "POST") {
        checkoutBody = body;
        if (failCheckout) return json({ error: "Pembayaran uji belum berhasil." }, 503);
        const transaction = { id: "new-sale", total: 60000, amountPaid: 20000, status: "COMPLETED" };
        const record = records.get(body.printingReceiptId);
        records.set(record.id, { ...record, transactionId: transaction.id, transaction });
        return json({ data: transaction });
      }
      if (url.pathname === "/api/products/flexi") return json({ data: { id: "flexi", name: "Flexi contoh", unit: "m²", stock: 50 } });
      return json({ error: `Unexpected ${method} ${url.pathname}` }, 404);
    });
    await page.goto("http://localhost:4377/");
    const openList = async () => { if (width < 768 && !await page.getByLabel("Cari nota SPANDUK", { exact: true }).isVisible()) await page.getByRole("button", { name: "Daftar nota", exact: true }).click(); };
    const create = page.getByRole("button", { name: "Buat Nota Kosong", exact: true }).first();
    await create.click();
    await page.getByLabel("Nama item baris 1", { exact: true }).fill("Spanduk Contoh");
    await page.getByLabel("Bahan baris 1", { exact: true }).fill("Flexi");
    await page.getByLabel("Banyaknya baris 1", { exact: true }).fill("2");
    await page.getByLabel("Harga satuan baris 1", { exact: true }).fill("30000");
    await page.getByLabel("Nama pelanggan", { exact: true }).fill("Pelanggan Contoh");
    await page.getByLabel("Nomor nota", { exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.getByLabel("Tanggal nota", { exact: true }).evaluate(element => document.activeElement === element), true);
    await page.getByText(/Baris dan hubungan stok/).click();
    await page.getByRole("button", { name: "Hubungkan stok", exact: true }).first().click();
    await page.getByRole("button", { name: /Flexi contoh Satuan m²/ }).click();
    await page.getByLabel("Jumlah pemakaian (m²)", { exact: true }).fill("4.5");
    await page.getByRole("button", { name: "Simpan hubungan", exact: true }).click();
    await page.getByLabel("Nama item baris 1", { exact: true }).fill("Simpan sebelum pindah");
    await page.getByRole("tab", { name: "PRINT", exact: true }).click();
    assert.equal(records.get("created-1").document.lines[0].name, "Simpan sebelum pindah");
    assert.deepEqual(records.get("created-1").document.lines[0].stockLink, { productId: "flexi", quantity: 4.5, unit: "m²" });
    await page.getByRole("tab", { name: "SPANDUK", exact: true }).click();
    assert.equal(await page.getByLabel("Nama item baris 1", { exact: true }).inputValue(), "Simpan sebelum pindah");
    failSave = true;
    await page.getByLabel("Nama item baris 1", { exact: true }).fill("Edit gagal tetap ada");
    await page.getByRole("tab", { name: "PRINT", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Simpan uji gagal" }).waitFor();
    assert.equal(await page.getByRole("tab", { name: "SPANDUK", exact: true }).getAttribute("aria-selected"), "true");
    assert.equal(await page.getByLabel("Nama item baris 1", { exact: true }).inputValue(), "Edit gagal tetap ada");
    failSave = false;
    await page.getByRole("button", { name: "Coba simpan lagi", exact: true }).click();
    await page.getByText("Tersimpan", { exact: true }).waitFor();
    assert.equal(records.get("created-1").document.lines[0].name, "Edit gagal tetap ada");
    await page.getByRole("button", { name: "Bayar / DP", exact: true }).click();
    failCheckout = true;
    await page.getByRole("button", { name: "Konfirmasi uji", exact: true }).click();
    await page.getByRole("dialog", { name: "Pembayaran uji" }).getByRole("alert").waitFor();
    assert.equal(await page.getByRole("dialog", { name: "Pembayaran uji" }).isVisible(), true);
    failCheckout = false;
    await page.getByRole("button", { name: "Konfirmasi uji", exact: true }).click();
    await page.getByRole("dialog", { name: /Nota SPANDUK/ }).waitFor();
    assert.equal(checkoutBody.printingReceiptId, "created-1");
    assert.equal(checkoutBody.items.length, 1);
    assert.equal(checkoutBody.items[0].printingServiceId, null);
    assert.equal(checkoutBody.items[0].rawMaterialProductId, "flexi");
    assert.equal(checkoutBody.items[0].rawMaterialQuantity, 4.5);
    assert.equal(checkoutBody.items[0].rawMaterialUnit, "m²");
    await page.getByRole("button", { name: "Tutup modal", exact: true }).click();
    assert.equal(await page.locator(".printing-receipt-sheet input,.printing-receipt-sheet textarea").count(), 0);
    await openList();
    await page.getByRole("button", { name: /SP-DIPROSES/ }).click();
    const processed = records.get("sp-processed");
    records.set(processed.id, { ...processed, transaction: { ...processed.transaction, amountPaid: 75000, status: "VOIDED" } });
    await page.getByRole("button", { name: "Cetak / PDF", exact: true }).click();
    const preview = page.getByRole("dialog", { name: /Nota SPANDUK/ });
    await preview.getByLabel("Status nota: DIBATALKAN", { exact: true }).waitFor();
    assert.equal(await preview.getByLabel("DP terbayar", { exact: true }).textContent(), "75.000");
    assert.equal(await preview.getByLabel("Sisa pembayaran", { exact: true }).textContent(), "0");
    await page.getByRole("button", { name: "Tutup modal", exact: true }).click();
    await openList();
    await page.getByRole("button", { name: /SP-LAMA/ }).click();
    await page.evaluate(() => window.setHarnessRole({ allowed: ["transaction:create"] }));
    await page.waitForFunction(() => document.querySelectorAll(".printing-receipt-sheet input,.printing-receipt-sheet textarea").length === 0);
    assert.equal(await create.isEnabled(), true);
    await page.evaluate(() => window.setHarnessRole({ allowed: ["transaction:delete"] }));
    await page.getByRole("button", { name: "Hapus draft", exact: true }).waitFor();
    await page.getByRole("button", { name: "Hapus draft", exact: true }).click();
    await page.getByRole("dialog", { name: "Hapus draft nota?", exact: true }).waitFor();
    await page.getByRole("button", { name: "Batal", exact: true }).click();
    assert.equal(await create.isDisabled(), true);
    await page.evaluate(() => window.setHarnessRole({ allowed: ["transaction:create", "transaction:update", "transaction:delete"] }));
    const name = page.getByLabel("Nama item baris 1", { exact: true });
    await name.fill("Jangan simpan antar pengguna");
    const patchesBeforeIdentityChange = calls.filter(call => call.method === "PATCH").length;
    await page.evaluate(() => window.setHarnessRole({ userId: "user-b" }));
    await page.getByRole("heading", { name: "Nota SPANDUK", exact: true }).waitFor();
    await page.waitForTimeout(800);
    assert.equal(calls.filter(call => call.method === "PATCH").length, patchesBeforeIdentityChange);
    assert.equal(records.get("sp-existing").document.lines[0].name, "Cetak contoh");
    for (const method of ["GET", "POST"]) {
      for (const changedScope of ["user", "store", "permissions"]) {
        const identity = `${method}-${changedScope}`;
        await page.evaluate(identity => window.setHarnessRole({ userId: `${identity}-a`, storeId: "store", authorizationFingerprint: identity, allowed: ["transaction:create", "transaction:update", "transaction:delete"] }), identity);
        await page.getByRole("heading", { name: "Nota SPANDUK", exact: true }).waitFor();
        const id = `late-${identity}`;
        const number = `LAMBAT-${identity}`;
        if (method === "GET") {
          records.set(id, { ...makeRecord(id, "SPANDUK", number), document: blankDocument() });
        }
        const delayed = deferResponse(method, id);
        if (method === "GET") {
          // A remount requests the list again and makes the empty fixture selectable.
          await page.evaluate(identity => window.setHarnessRole({ userId: `${identity}-open` }), identity);
          await openList();
          await page.getByRole("button", { name: new RegExp(number) }).click();
        } else await create.click();
        await delayed.started;
        const patchesBeforeLateResponse = calls.filter(call => call.method === "PATCH").length;
        const nextScope = changedScope === "user" ? { userId: `${identity}-b` }
          : changedScope === "store" ? { storeId: "other-store" }
          : { authorizationFingerprint: `${identity}-revoked`, allowed: ["transaction:read"] };
        await page.evaluate(next => window.setHarnessRole(next), nextScope);
        await page.getByRole("heading", { name: "Nota SPANDUK", exact: true }).waitFor();
        delayed.release();
        await page.waitForTimeout(850);
        assert.equal(calls.filter(call => call.method === "PATCH").length, patchesBeforeLateResponse, `${method} response must not revive autosave after ${changedScope} change`);
        assert.equal(await page.locator(".printing-receipt-sheet input,.printing-receipt-sheet textarea").count(), 0, `${method} response must not display an old editor after ${changedScope} change`);
      }
    }
    await page.evaluate(() => window.setHarnessRole({ userId: "final-user", storeId: "store", authorizationFingerprint: "final", allowed: ["transaction:create", "transaction:update", "transaction:delete"] }));
    await create.click();
    await page.getByLabel("Nama item baris 1", { exact: true }).fill("Nota tampilan contoh");
    await page.getByLabel("Banyaknya baris 1", { exact: true }).fill("1");
    await page.getByLabel("Harga satuan baris 1", { exact: true }).fill("30000");
    await page.getByLabel("Nama pelanggan", { exact: true }).fill("Pelanggan Contoh");
    await page.getByText("Tersimpan", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `workspace-${width}.png`) });
    if (width === 1280) await page.screenshot({ path: path.join(web, "public/images/changelog/nota-percetakan.png"), clip: { x: 0, y: 0, width, height: 640 } });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.deepEqual(errors, []);
    process.stdout.write(`PASS ${width}px: create, inline Enter, explicit stock link, flush/switch, save failure/retry, checkout failure/retry/lock, fresh processed preview, action permissions, user identity reset, bounded viewport\n`);
    await page.close();
  }
} finally {
  await browser.close();
  esbuild.stop();
}
