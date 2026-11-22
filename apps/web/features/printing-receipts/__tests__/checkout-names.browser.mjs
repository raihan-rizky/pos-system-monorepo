import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repo = process.cwd();
const web = path.join(repo, "apps/web");
const require = createRequire(path.join(web, "package.json"));
const esbuild = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const loadConfig = require("tailwindcss/loadConfig");
const fixtures = {
  "@/components/providers/RoleProvider": `export const useRole=()=>({role:'ADMIN',userId:'user',storeId:'store',authorizationFingerprint:'same',canPerform:(_resource,action)=>!(window.denyUpdate&&action==='update')});`,
  "@/components/PaymentModal": `import React,{useState} from 'react';export function PaymentModal(props){
    const [customer,setCustomer]=useState('Pelanggan Baru');const [sales,setSales]=useState('Sales Baru');const [date,setDate]=useState(props.receiptInvoiceDate);
    return <section role='dialog' aria-label='Pembayaran uji'><label>Pelanggan uji<input value={customer} onChange={e=>setCustomer(e.target.value)}/></label>
    <label>Sales uji<input value={sales} onChange={e=>setSales(e.target.value)}/></label><label>Tanggal uji<input type='date' value={date} onChange={e=>setDate(e.target.value)}/></label>{props.draftError&&<p role='alert'>{props.draftError}</p>}
    <button disabled={props.isProcessing} onClick={()=>props.onConfirm({customerName:customer,customerId:null,salesName:sales==='TANPA_NILAI'?undefined:sales,salespersonId:sales&&sales!=='TANPA_NILAI'?'sales-1':'',paymentMethod:'CASH',amountPaid:50000,discount:0,tax:0,note:'',invoiceDate:date,invoiceDateReason:'Sesuai nota'})}>Konfirmasi uji</button><button onClick={props.onClose}>Batal uji</button></section>;
  }`,
};
if (process.argv.includes("--real-customer-reopen") || process.argv.includes("--stale-customer-cache")) {
  delete fixtures["@/components/PaymentModal"];
  Object.assign(fixtures, {
    "@/hooks/useCustomers": `export const useCreateCustomer=()=>({mutateAsync:async input=>{window.customerCreations.push(input);return {id:'customer-created',name:input.name}},isPending:false});`,
    "@/hooks/useSalespersons": `export const useSalespersons=()=>({data:[]});`,
    "@/hooks/useCustomerCategoryPricingRules": `export const useCustomerCategoryPricingRules=()=>({data:[],isError:false});`,
    "@/features/pos-checkout/hooks/useCartCatalogPrices": `export const useCartCatalogPrices=items=>items;`,
    "@/features/product-price-rounding/hooks/usePriceRoundingSettings": `export const usePriceRoundingSettings=()=>({data:{enabled:false,increment:500,threshold:50},isError:false,isPlaceholderData:false});`,
    "@/features/customer-category-pricing/hooks/useSpecialPricingSettings": `export const useSpecialPricingSettings=()=>({data:false,isError:false,isPlaceholderData:false});`,
    "@/features/invoice-date/hooks/useServerClock": `export const useServerClock=()=>({now:new Date('2026-10-20T03:00:00Z'),source:'TIMEAPI_IO',isLoading:false,lastSyncedAt:0});`,
    "@/features/pos-checkout/components/CustomerCheckoutSelect": `import React from 'react';export const CustomerCheckoutSelect=({value})=><div aria-label='Pelanggan pilihan'>{value.kind}:{value.customer?.id??value.name??''}</div>;`,
  });
}

const bundle = await esbuild.build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {PrintingReceiptWorkspace} from './features/printing-receipts/components/PrintingReceiptWorkspace';const client=new QueryClient({defaultOptions:{queries:{retry:false}}});createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><PrintingReceiptWorkspace/></QueryClientProvider>);`, resolveDir: web, loader: "tsx" },
  bundle: true, write: false, outfile: "checkout-names.js", platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web, "@pos/ui": path.join(repo, "packages/ui/src/index.ts") },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "fixtures", setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => fixtures[args.path] ? { path: args.path, namespace: "fixture" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtures[args.path], loader: "tsx", resolveDir: web }));
  } }],
});
const config = loadConfig(path.join(web, "tailwind.config.ts"));
const files = ["PrintingReceiptWorkspace.tsx", "PrintingReceiptView.tsx", "PrintingReceiptModal.tsx"];
const source = (await Promise.all(files.map(file => readFile(path.join(web, "features/printing-receipts/components", file), "utf8")))).join("\n");
const css = await postcss([tailwind({ ...config, content: [{ raw: source, extension: "tsx" }, path.join(repo, "packages/ui/src/**/*.{ts,tsx}")] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined });
const html = `<!doctype html><html lang="id"><head><style>html,body{margin:0}#root{display:flex;height:100dvh}${css.css}${bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? ""}</style></head><body><div id="root"></div><script>window.customerCreations=[];window.denyUpdate=${process.argv.includes("--create-only")};${bundle.outputFiles.find(file => file.path.endsWith(".js")).text}</script></body></html>`;
const categories = ["SPANDUK", "PERCETAKAN", "PLAT", "STEMPEL", "PRINT"];
const record = (category, suffix = "") => ({ id: `${category}${suffix}`, storeId: "store", subcategory: category, number: `NOTA-${category}${suffix}`, revision: 1, transactionId: null, createdAt: "2026-10-20", updatedAt: "2026-10-20", document: { customerName: "Pelanggan Lama", customerPhone: "", customerId: null, date: "2026-10-20", note: "", completionDate: "", completionTime: "", receiver: "Penerima Lama", setter: "Petugas Seting", signatory: "Nama Manual", lines: [{ id: "line", name: "Cetak", material: "", quantity: 1, price: 50000, stockLink: null }] } });
const records = new Map([...categories.map(category => record(category)), record("SPANDUK", "-retry"), record("SPANDUK", "-manual")].map(item => [item.id, item]));
records.get("SPANDUK-retry").document.customerId = "customer-old";
let failCheckout = false;
let loseResponse = false;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const width = process.argv.includes("--mobile") ? 390 : 1280;
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: process.argv.includes("--screenshot") ? 2 : 1 });
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = request.postDataJSON();
    const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
    if (url.pathname.startsWith("/images/printing-receipts/")) return route.fulfill({ contentType: "image/png", body: await readFile(path.join(web, "public", url.pathname)) });
    if (url.pathname === "/api/printing-receipts" && method === "GET") {
      const data = [...records.values()].filter(item => item.subcategory === url.searchParams.get("subcategory"));
      return json({ data, pagination: { page: 1, total: data.length, totalPages: 1 } });
    }
    if (url.pathname.startsWith("/api/printing-receipts/")) {
      const id = decodeURIComponent(url.pathname.split("/").at(-1));
      const current = records.get(id);
      if (method === "GET") {
        if (current.transactionId && ["--lost-response-no-read", "--legacy-response-no-read", "--new-no-read", "--concurrent-no-read"].some(flag => process.argv.includes(flag))) return json({ error: "Tidak memiliki izin melihat nota." }, 403);
        return json({ data: current });
      }
      if (method === "PATCH") {
        if (process.argv.includes("--create-only")) return json({ error: "Tidak memiliki izin mengubah draft." }, 403);
        if (current.transactionId) return json({ error: "Nota sudah diproses." }, 409);
        assert.equal(body.revision, current.revision);
        const updated = { ...current, ...body, revision: current.revision + 1 };
        records.set(id, updated);
        return json({ data: updated });
      }
    }
    if (url.pathname === "/api/transactions" && method === "POST") {
      if (failCheckout) return json({ error: "Pembayaran gagal." }, 503);
      const current = records.get(body.printingReceiptId);
      if (current.transactionId) return json({ data: current.transaction });
      assert.equal(body.printingReceiptRevision, current.revision);
      const selectedCustomer = body.printingReceiptCheckout?.customerName ?? current.document.customerName;
      const customerId = body.printingReceiptCheckout ? body.printingReceiptCheckout.customerId : current.document.customerId;
      const salesName = body.salesName?.trim() || null;
      const legacy = process.argv.includes("--legacy-response-no-read");
      const invoiceDate = body.invoiceDate ? new Date(`${body.invoiceDate}T00:00:00+07:00`).toISOString() : null;
      const transaction = { id: `sale-${current.id}`, total: 50000, amountPaid: 50000, status: "COMPLETED", customerName: selectedCustomer, customerId, salesName: legacy ? "Sales Manual" : salesName, salespersonId: legacy ? null : body.salespersonId || null, salesperson: !legacy && salesName ? { name: salesName } : null, invoiceDate };
      const document = { ...current.document, date: body.invoiceDate ?? current.document.date, customerName: selectedCustomer, customerId, receiver: current.subcategory === "SPANDUK" ? selectedCustomer : current.document.receiver, signatory: legacy ? current.document.signatory : salesName || current.document.signatory };
      records.set(current.id, { ...current, document, transactionId: transaction.id, transaction });
      if (loseResponse) { loseResponse = false; return route.abort("failed"); }
      return json({ data: transaction }, 201);
    }
    return json({ error: `Unexpected ${method} ${url.pathname}` }, 404);
  });
  await page.goto("http://localhost:4378/");
  const select = async (category, suffix = "") => {
    await page.getByRole("tab", { name: category === "PRINT" ? "PRINT/FC" : category, exact: true }).click();
    const list = page.getByRole("button", { name: "Daftar nota", exact: true });
    if (width < 768 && await list.getAttribute("aria-expanded") === "false") await list.click();
    await page.getByRole("button", { name: new RegExp(`NOTA-${category}${suffix}(?:\\s|$)`) }).click();
  };
  const pay = async (customer = "Pelanggan Baru", sales = "Sales Baru") => {
    await page.getByRole("button", { name: "Bayar / DP", exact: true }).click();
    await page.getByLabel("Pelanggan uji").fill(customer);
    await page.getByLabel("Sales uji").fill(sales);
    await page.getByRole("button", { name: "Konfirmasi uji" }).click();
  };
  if (process.argv.includes("--draft")) {
    await select("SPANDUK");
    await page.getByRole("button", { name: "Cetak / PDF", exact: true }).click();
    const modal = page.getByRole("dialog", { name: /Nota SPANDUK/ });
    await modal.getByLabel("Status nota: DRAFT").waitFor();
    assert.equal(await modal.getByRole("button", { name: "Unduh PDF" }).isDisabled(), true);
    assert.equal(await modal.getByRole("button", { name: "Cetak", exact: true }).isDisabled(), true);
    assert.match(await modal.innerText(), /proses|bayar/i);
    process.stdout.write("Draft preview blocks PDF and print\n");
    process.exitCode = 0;
  } else if (process.argv.includes("--real-customer-reopen")) {
    await select("SPANDUK");
    failCheckout = true;
    await page.getByRole("button", { name: "Bayar / DP", exact: true }).click();
    await page.getByRole("button", { name: "Uang Pas", exact: true }).click();
    await page.getByRole("button", { name: "Konfirmasi Bayar", exact: true }).click();
    await page.getByText("Pembayaran gagal.", { exact: true }).first().waitFor();
    assert.equal(await page.evaluate(() => window.customerCreations.length), 1);
    await page.getByRole("button", { name: "Batal", exact: true }).click();
    failCheckout = false;
    await page.getByRole("button", { name: "Bayar / DP", exact: true }).click();
    await page.getByRole("button", { name: "Uang Pas", exact: true }).click();
    await page.getByRole("button", { name: "Konfirmasi Bayar", exact: true }).click();
    await page.getByRole("dialog", { name: /Nota SPANDUK/ }).waitFor();
    assert.equal(await page.evaluate(() => window.customerCreations.length), 1, "Pelanggan yang sudah dibuat tidak dibuat lagi setelah modal dibuka ulang");
    assert.equal(records.get("SPANDUK").document.customerId, "customer-created");
    process.stdout.write("Created customer survives closing and reopening payment\n");
  } else if (process.argv.includes("--stale-customer-cache")) {
    await select("SPANDUK");
    failCheckout = true;
    await page.getByRole("button", { name: "Bayar / DP", exact: true }).click();
    await page.getByRole("button", { name: "Uang Pas", exact: true }).click();
    await page.getByRole("button", { name: "Konfirmasi Bayar", exact: true }).click();
    await page.getByText("Pembayaran gagal.", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "Batal", exact: true }).click();
    await page.getByRole("dialog", { name: "Pembayaran", exact: true }).waitFor({ state: "detached" });
    failCheckout = false;
    const saveDraft = page.waitForResponse(response => response.request().method() === "PATCH" && response.ok());
    await page.locator('textarea[data-receipt-field="customerName"]').fill("Pelanggan Manual Terbaru");
    await saveDraft;
    await page.getByRole("button", { name: "Bayar / DP", exact: true }).click();
    assert.equal(await page.getByLabel("Pelanggan pilihan").textContent(), "new:Pelanggan Manual Terbaru");
    await page.getByRole("button", { name: "Uang Pas", exact: true }).click();
    await page.getByRole("button", { name: "Konfirmasi Bayar", exact: true }).click();
    await page.getByRole("dialog", { name: /Nota SPANDUK/ }).waitFor();
    assert.equal(records.get("SPANDUK").document.customerName, "Pelanggan Manual Terbaru");
    assert.equal(await page.evaluate(() => window.customerCreations.length), 2);
    process.stdout.write("Manual draft customer changes override the cached checkout selection\n");
  } else if (process.argv.includes("--new-no-read")) {
    await select("SPANDUK");
    await pay();
    const preview = page.getByRole("dialog", { name: /Nota SPANDUK/ });
    const notice = page.getByRole("alert").filter({ hasText: /pembayaran.*tercatat.*nota.*dimuat/i });
    await Promise.race([preview.waitFor({ timeout: 5000 }), notice.waitFor({ timeout: 5000 })]);
    assert.equal(await notice.isVisible(), false, "Checkout baru memakai snapshot tervalidasi saat pembacaan ulang gagal");
    assert.equal(await preview.getByLabel("Hormat kami", { exact: true }).first().textContent(), "Sales Baru");
    assert.equal(await preview.getByLabel("Penerima", { exact: true }).first().textContent(), "Pelanggan Baru");
    process.stdout.write("New checkout uses its confirmed snapshot if refresh fails\n");
  } else if (process.argv.includes("--concurrent-no-read")) {
    await select("SPANDUK");
    await page.getByRole("button", { name: "Bayar / DP", exact: true }).click();
    const current = records.get("SPANDUK");
    const transaction = { id: "sale-external", total: 90000, amountPaid: 90000, status: "COMPLETED", customerName: "Pelanggan Lain", customerId: null, salesName: "Sales Lain", salespersonId: "sales-other" };
    records.set("SPANDUK", { ...current, document: { ...current.document, date: "2026-10-21", lines: [{ ...current.document.lines[0], name: "Isi terbaru" }] }, transactionId: transaction.id, transaction });
    await page.getByRole("button", { name: "Konfirmasi uji" }).click();
    await page.getByRole("alert").filter({ hasText: /pembayaran.*tercatat.*nota.*dimuat/i }).waitFor();
    assert.equal(await page.getByRole("dialog", { name: /Nota SPANDUK/ }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Bayar / DP", exact: true }).count(), 0);
    process.stdout.write("Concurrent checkout cannot print a stale receipt\n");
  } else if (process.argv.includes("--create-only")) {
    await select("SPANDUK");
    await pay();
    const preview = page.getByRole("dialog", { name: /Nota SPANDUK/ });
    const error = page.getByRole("dialog", { name: "Pembayaran uji" }).getByRole("alert");
    await Promise.race([preview.waitFor({ timeout: 5000 }), error.waitFor({ timeout: 5000 })]);
    assert.equal(await error.isVisible(), false, "Checkout harus berjalan dengan izin create tanpa update draft");
    await preview.waitFor();
    assert.equal(records.get("SPANDUK").document.signatory, "Sales Baru");
    assert.equal(records.get("SPANDUK").document.receiver, "Pelanggan Baru");
    process.stdout.write("Create-only checkout saves names\n");
  } else if (process.argv.includes("--lost-response") || process.argv.includes("--lost-date") || process.argv.includes("--lost-response-no-read") || process.argv.includes("--legacy-response-no-read")) {
    await select("SPANDUK");
    loseResponse = true;
    await pay("Pelanggan Pertama", "Sales Pertama");
    await page.getByRole("dialog", { name: "Pembayaran uji" }).getByRole("alert").waitFor();
    await page.getByLabel("Pelanggan uji").fill("Pelanggan Kedua");
    await page.getByLabel("Sales uji").fill("Sales Kedua");
    if (process.argv.includes("--lost-date")) await page.getByLabel("Tanggal uji").fill("2026-10-21");
    await page.getByRole("button", { name: "Konfirmasi uji" }).click();
    if (process.argv.includes("--lost-response-no-read") || process.argv.includes("--legacy-response-no-read")) {
      const notice = page.getByRole("alert").filter({ hasText: /pembayaran.*tercatat.*nota.*dimuat/i });
      const preview = page.getByRole("dialog", { name: /Nota SPANDUK/ });
      await Promise.race([notice.waitFor({ timeout: 5000 }), preview.waitFor({ timeout: 5000 })]);
      assert.equal(await preview.isVisible(), false, "Nota yang belum berhasil dimuat ulang tidak boleh dipratinjau atau dicetak");
      await notice.waitFor();
      assert.equal(await page.getByRole("button", { name: "Bayar / DP", exact: true }).count(), 0);
      process.stdout.write("Recorded payment does not show an unverified receipt\n");
    } else {
    const preview = page.getByRole("dialog", { name: /Nota SPANDUK/ });
    const error = page.getByRole("dialog", { name: "Pembayaran uji" }).getByRole("alert");
    await Promise.race([preview.waitFor({ timeout: 5000 }), error.waitFor({ timeout: 5000 })]);
    assert.equal(await error.isVisible(), false, "Pengulangan harus membuka transaksi yang sudah tersimpan");
    assert.equal(await preview.getByLabel("Hormat kami", { exact: true }).first().textContent(), "Sales Pertama");
    assert.equal(await preview.getByLabel("Penerima", { exact: true }).first().textContent(), "Pelanggan Pertama");
    assert.equal(records.get("SPANDUK").document.date, "2026-10-20");
    process.stdout.write("Lost checkout response is idempotent\n");
    }
  } else if (process.argv.includes("--failed-reopen")) {
    await select("SPANDUK");
    failCheckout = true;
    await pay("Pelanggan Awal", "Sales Sementara");
    await page.getByRole("dialog", { name: "Pembayaran uji" }).getByRole("alert").waitFor();
    assert.equal(records.get("SPANDUK").document.signatory, "Nama Manual", "Pembayaran gagal tidak boleh mengubah nama draft");
    await page.getByRole("button", { name: "Batal uji" }).click();
    failCheckout = false;
    await pay("Pelanggan Umum", "");
    await page.getByRole("dialog", { name: /Nota SPANDUK/ }).waitFor();
    assert.equal(records.get("SPANDUK").document.signatory, "Nama Manual");
    process.stdout.write("Failed checkout keeps the manual name\n");
  } else if (process.argv.includes("--missing-sales")) {
    await select("SPANDUK");
    await pay("Pelanggan Umum", "TANPA_NILAI");
    const preview = page.getByRole("dialog", { name: /Nota SPANDUK/ });
    const error = page.getByRole("dialog", { name: "Pembayaran uji" }).getByRole("alert");
    await Promise.race([preview.waitFor({ timeout: 5000 }), error.waitFor({ timeout: 5000 })]);
    assert.equal(await error.isVisible(), false, "Checkout tanpa nilai sales harus tetap berhasil");
    await preview.waitFor();
    assert.equal(records.get("SPANDUK").document.signatory, "Nama Manual");
    process.stdout.write("Missing sales keeps the manual name\n");
  } else {
  for (const category of categories) {
    await select(category);
    await pay();
    const modal = page.getByRole("dialog", { name: new RegExp(`Nota ${category}`) });
    await modal.waitFor();
    const saved = records.get(category).document;
    assert.equal(saved.customerName, "Pelanggan Baru", `${category}: pelanggan pada Yth`);
    assert.equal(saved.signatory, "Sales Baru", `${category}: sales pada Hormat Kami`);
    assert.equal(saved.receiver, category === "SPANDUK" ? "Pelanggan Baru" : "Penerima Lama", `${category}: penerima`);
    assert.equal(saved.setter, "Petugas Seting");
    assert.equal(await modal.getByLabel("Hormat kami", { exact: true }).first().textContent(), "Sales Baru");
    if (category === "SPANDUK" && process.argv.includes("--screenshot")) {
      const field = modal.getByLabel("Hormat kami", { exact: true }).first();
      await field.scrollIntoViewIfNeeded();
      const box = await field.boundingBox();
      assert.ok(box);
      const x = Math.max(0, box.x - 24);
      const y = Math.max(0, box.y - 42);
      await page.screenshot({ path: path.join(web, "public/images/changelog/nama-otomatis-nota-2026-11-12.png"), clip: { x, y, width: Math.min(155, width - x), height: Math.min(59, 900 - y) } });
    }
    await page.getByRole("button", { name: "Tutup modal", exact: true }).click();
    await page.getByRole("button", { name: "Cetak / PDF", exact: true }).click();
    const reopened = page.getByRole("dialog", { name: new RegExp(`Nota ${category}`) });
    await reopened.waitFor();
    assert.equal(await reopened.getByLabel("Hormat kami", { exact: true }).first().textContent(), "Sales Baru");
    assert.equal(await reopened.getByLabel("Nama pelanggan", { exact: true }).first().textContent(), "Pelanggan Baru");
    await page.getByRole("button", { name: "Tutup modal", exact: true }).click();
  }
  await select("SPANDUK", "-retry");
  failCheckout = true;
  await pay("Pelanggan Awal", "Sales Awal");
  await page.getByRole("dialog", { name: "Pembayaran uji" }).getByRole("alert").waitFor();
  failCheckout = false;
  await page.getByLabel("Pelanggan uji").fill("Pelanggan Umum");
  await page.getByLabel("Sales uji").fill("Sales Terbaru");
  await page.getByRole("button", { name: "Konfirmasi uji" }).click();
  await page.getByRole("dialog", { name: /Nota SPANDUK/ }).waitFor();
  assert.equal(records.get("SPANDUK-retry").document.receiver, "Pelanggan Umum");
  assert.equal(records.get("SPANDUK-retry").document.signatory, "Sales Terbaru");
  assert.equal(records.get("SPANDUK-retry").document.customerId, null);
  await page.getByRole("button", { name: "Tutup modal", exact: true }).click();
  await select("SPANDUK", "-manual");
  failCheckout = true;
  await pay("Pelanggan Umum", "Sales Sementara");
  await page.getByRole("dialog", { name: "Pembayaran uji" }).getByRole("alert").waitFor();
  failCheckout = false;
  await page.getByLabel("Sales uji").fill("");
  await page.getByRole("button", { name: "Konfirmasi uji" }).click();
  await page.getByRole("dialog", { name: /Nota SPANDUK/ }).waitFor();
  assert.equal(records.get("SPANDUK-manual").document.signatory, "Nama Manual");
  process.stdout.write("Checkout names: all receipt types and retry passed\n");
  }
} finally {
  await browser.close();
}
