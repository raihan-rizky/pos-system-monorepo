import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const repo = path.resolve(web, "../..");
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const bundle = await build({
  stdin: { contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { ShoppingRequestFinalApprovalModal } from './features/suppliers/shopping-requests/components/ShoppingRequestFinalApprovalModal';
    import { ShoppingRequestList } from './features/suppliers/shopping-requests/components/ShoppingRequestList';
    function App() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Buka persetujuan</button>
        <ShoppingRequestList onCreateClick={() => {}} onReceive={() => {}} onCompare={() => {}} onViewReceiptHistory={() => {}} />
        <ShoppingRequestFinalApprovalModal requestId={open ? 'request-1' : null} onClose={() => setOpen(false)} /></>;
    }
    const root = createRoot(document.getElementById('root'));
    window.renderPayment = method => { window.badgeMethod = method; root.render(<App key={Math.random()} />); };
    window.renderPayment('GIRO');
  `, resolveDir: web, sourcefile: "shopping-payment-harness.tsx", loader: "tsx" },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web, "@pos/ui": path.join(repo, "packages/ui/src/index.ts") },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "shopping-payment-fixtures", setup(builder) {
    builder.onResolve({ filter: /useShoppingRequests$/ }, () => ({ path: "hooks", namespace: "fixture" }));
    builder.onResolve({ filter: /RoleProvider$/ }, () => ({ path: "role", namespace: "fixture" }));
    builder.onResolve({ filter: /\/(ShoppingRequestPrintModal|ShoppingRequestApproveModal|ShoppingRequestEditModal|ShoppingRequestApprovedQtyModal|GoodsPurchaseCreateModal|GoodsPurchaseApprovalModal|GoodsPurchaseDetailModal|GoodsPurchaseRejectModal|ProductAutocomplete|ShoppingRequestUnitSelect|ProductStockThumbnail)$/ }, args => ({ path: args.path.split("/").at(-1), namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => {
      const contents = args.path === "hooks" ? `
        const request = { id:'request-1', items:[{id:'item-1',productId:'paper',productName:'Kertas Contoh',productSku:'CONTOH-001',unit:'dus',requestedQty:1,imageUrl:null,product:{costPrice:1000,stockGroup:null}}] };
        export const useShoppingRequest = id => ({data:id ? request : null});
        export const useFinalizeShoppingRequest = () => ({isPending:false,mutateAsync:async payload => {
          if(window.failPayment) throw new Error('Pembayaran belum bisa disimpan. Coba lagi.');
          window.savedPayment=payload;
        }});
        export const useRejectShoppingRequest = () => ({isPending:false,mutateAsync:async()=>{}});
        export const useCancelShoppingRequest = () => ({isPending:false,mutateAsync:async()=>{}});
        export const useShoppingRequestSummary = () => ({data:{pendingRequestCount:0,pendingRequestedQty:0,approvedRequestCount:1,fulfillmentRate:100}});
        export const useShoppingRequests = () => ({data:{data:[{
          id:'request-1',number:'DPB-CONTOH',name:'Daftar Belanja Contoh',status:'APPROVED',supplierName:'Supplier Contoh',createdAt:'2026-10-19T00:00:00Z',
          itemCount:1,totalRequestedQty:1,totalApprovedQty:1,decidedItemCount:1,pendingItemCount:0,
          purchase:{id:'purchase-1',number:'PB-CONTOH',status:'APPROVED',fulfillmentStatus:'NOT_RECEIVED',totalAmount:1000,paymentMethod:window.badgeMethod}
        }]}});
      ` : args.path === "role" ? "export const useRole=()=>({canPerform:()=>true});"
        : `export const ${args.path}=()=>null;`;
      return { contents, loader: "js", resolveDir: web };
    });
  } }],
});
const sources = await Promise.all(["ShoppingRequestFinalApprovalModal.tsx", "ShoppingRequestList.tsx"].map(file =>
  readFile(path.join(web, "features/suppliers/shopping-requests/components", file), "utf8")));
const css = await postcss([tailwind({
  content: [...sources.map(raw => ({ raw, extension: "tsx" })), path.join(repo, "packages/ui/src/**/*.tsx")],
  theme: { extend: { colors: { surface: require("tailwindcss/colors").slate, brand: require("tailwindcss/colors").blue } } },
})]).process("@tailwind base; @tailwind components; @tailwind utilities;", { from: undefined });
const artifacts = path.join(repo, "output/playwright/shopping-payment");
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://localhost:3004/__shopping-payment-fixture", route => route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>' }));
  await page.goto("http://localhost:3004/__shopping-payment-fixture");
  await page.addStyleTag({ content: css.css });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByLabel("Metode pembayaran: Giro", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Buka persetujuan" }).click();
  const method = page.getByRole("combobox", { name: /Metode Pembayaran/ });
  const date = page.getByLabel("Tanggal Jatuh Tempo", { exact: true });
  const approve = page.getByRole("button", { name: "Setujui dan Catat Pembelian", exact: true });
  assert.equal(await method.inputValue(), "TRANSFER");
  assert.equal(await date.count(), 0);
  await method.selectOption("GIRO");
  assert.equal(await date.getAttribute("required"), "");
  assert.equal(await approve.isDisabled(), true);
  await date.fill("2026-11-02");
  assert.equal(await approve.isEnabled(), true);
  await method.focus();
  await page.keyboard.press("Tab");
  assert.equal(await date.evaluate(element => document.activeElement === element), true);
  const methodBox = await method.boundingBox();
  const dateBox = await date.boundingBox();
  const totalBox = await page.getByText("Total Pengeluaran:", { exact: false }).boundingBox();
  assert.ok(methodBox.x > totalBox.x + totalBox.width, "payment method sits beside the total on desktop");
  assert.ok(dateBox.x > methodBox.x + methodBox.width, "due date sits beside the payment method");
  await page.getByRole("heading", { name: "Setujui Daftar Belanja", exact: true }).click();
  await page.screenshot({ path: path.join(artifacts, "desktop.png"), fullPage: true });
  await page.screenshot({ path: path.join(repo, "apps/web/public/images/changelog/pembayaran-daftar-belanja.png"), animations: "disabled", clip: {
    x: methodBox.x - 8, y: methodBox.y - 24, width: dateBox.x + dateBox.width - methodBox.x + 16, height: methodBox.height + 32,
  } });
  await method.selectOption("TRANSFER");
  assert.equal(await date.count(), 0);
  await method.selectOption("GIRO");
  assert.equal(await date.inputValue(), "");
  await date.fill("2026-11-02");
  await page.evaluate(() => { window.failPayment = true; });
  await approve.click();
  await page.getByRole("alert").filter({ hasText: "Pembayaran belum bisa disimpan" }).waitFor();
  await page.evaluate(() => { window.failPayment = false; });
  await approve.click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.deepEqual(await page.evaluate(() => ({method:window.savedPayment.input.paymentMethod,date:window.savedPayment.input.paymentDueDate})), {method:"GIRO",date:"2026-11-02"});
  await page.getByRole("button", { name: "Buka persetujuan" }).click();
  assert.equal(await method.inputValue(), "TRANSFER");
  await approve.click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.deepEqual(await page.evaluate(() => ({method:window.savedPayment.input.paymentMethod,date:window.savedPayment.input.paymentDueDate})), {method:"TRANSFER",date:null});
  await page.evaluate(() => window.renderPayment("TRANSFER"));
  await page.getByLabel("Metode pembayaran: Transfer", { exact: true }).waitFor();
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "Buka persetujuan" }).click();
    await method.selectOption("GIRO");
    await date.fill("2026-11-02");
    assert.equal(await page.getByRole("dialog").evaluate(element => element.scrollWidth <= element.clientWidth), true, `no modal overflow at ${width}px`);
    await date.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, `mobile-${width}.png`), fullPage: true });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  }
  assert.deepEqual(errors, []);
  process.stdout.write("PASS: Transfer/Giro badges, desktop placement, required giro date, reset, submission, retry, keyboard, Escape, and responsive layout (768/390/320px).\n");
} finally {
  await browser.close();
}
