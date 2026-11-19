import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const repo = path.resolve(web, "../..");
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const component = path.join(web, "features/suppliers/shopping-requests/components/ShoppingRequestCorrectionModal.tsx");
const source = await readFile(component, "utf8");
const preview = {
  version: "preview-1", oldTotal: "8936156.00", newTotal: "8816156.00", paid: "0.00", overpaid: "0.00", stock: [], affectedDates: ["2026-11-12", "2026-11-17"],
  changes: [{ field: "pembayaran.metode", before: "TRANSFER", after: null }, { field: "pembayaran.jadwal", before: [{ method: "TRANSFER", amount: "8936156.00", dueDate: null, note: null }], after: [
    { method: "TRANSFER", amount: "4947500.00", dueDate: null, note: null },
    { method: "GIRO", amount: "3868656.00", dueDate: "2026-12-05", note: "Sisa belanja" },
  ] }],
};
const fixture = {
  requestId: "request-example", purchaseId: "purchase-example", totalAmount: "8936156.00", version: "editor-1",
  header: { name: "Daftar contoh", number: "DB-CONTOH", businessDate: "2026-11-12", supplierId: null, requestedByName: "Pengguna Contoh", note: null },
  items: [{ clientLineKey: "line", requestItemId: "request-line", purchaseItemId: "purchase-line", productId: "example-product", productName: "Kertas Contoh", sku: "CONTOH-001", unit: "pak", requestedQty: 1, approvedQty: 1, orderedQty: 1, unitPrice: "8936156.00", receipts: [{ receiptLineId: "receipt-line", receivedQty: 1 }], catalogCostPrice: "8936156.00", catalogSalePrice: "9500000.00", catalogUpdatedAt: "2026-11-12T00:00:00Z" }],
  payment: { method: "TRANSFER", dueDate: null, schedule: [{ method: "TRANSFER", amount: "8936156.00", dueDate: null, note: null }], sources: [], allocations: [] }, pendingReceipts: [],
};
const bundle = await build({
  stdin: { contents: `import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {ShoppingRequestCorrectionModal} from './features/suppliers/shopping-requests/components/ShoppingRequestCorrectionModal';
    function App(){const [section,setSection]=useState(null);return <><p>Pengujian dengan data contoh</p><button id="opener" onClick={()=>setSection('details')}>Buka koreksi contoh</button><button id="payment-opener" onClick={()=>setSection('payment')}>Ubah pembayaran contoh</button>{section&&<ShoppingRequestCorrectionModal requestId="request-example" initialSection={section} onClose={()=>setSection(null)}/>}</>}
    window.saveCalls=[];window.previewCalls=[];window.failOnce=true;window.conflictNext=false;createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: web, sourcefile: "shopping-correction-harness.tsx", loader: "tsx" },
  bundle: true, write: false, outdir: path.join(repo, "output/playwright/shopping-correction-flexible/bundle"), external: ["/fonts/*"], platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web, "@pos/ui": path.join(repo, "packages/ui/src/index.ts") },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "correction-boundary-fixtures", setup(builder) {
    builder.onResolve({ filter: /useShoppingRequestCorrection$/ }, () => ({ path: "hooks", namespace: "correction-fixture" }));
    builder.onResolve({ filter: /\/(SupplierSelector|ProductAutocomplete)$/ }, args => ({ path: args.path.split("/").at(-1), namespace: "correction-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "correction-fixture" }, args => ({ contents: args.path === "hooks" ? `
      const editor=${JSON.stringify(fixture)},preview=${JSON.stringify(preview)};
      export const useCorrectionEditor=()=>({data:editor,isPending:false,isError:false,refetch:async()=>({data:{...editor,version:'editor-2'}})});
      export const usePreviewCorrection=()=>({isPending:false,mutateAsync:async input=>{window.previewCalls.push(input);if(window.conflictNext){window.conflictNext=false;throw Object.assign(new Error('Data berubah. Muat ulang.'),{status:409});}return preview;}});
      export const useSaveCorrection=()=>({isPending:false,mutateAsync:async input=>{window.saveCalls.push(input);if(window.failOnce){window.failOnce=false;throw new Error('Koneksi terputus. Coba simpan lagi.');}return {correctionId:'example-audit'};}});
    ` : `export const ${args.path}=()=>null;`, loader: "js", resolveDir: web }));
  } }],
});
const cssSources = await Promise.all([
  "features/suppliers/shopping-requests/components/CorrectionPaymentComparison.tsx",
  "features/inventory-management/components/InboundPaymentFields.tsx",
  "../../packages/ui/src/Modal.tsx",
].map(file => readFile(path.join(web, file), "utf8")));
const css = await postcss([tailwind({ content: [source, ...cssSources].map(raw => ({ raw, extension: "tsx" })), theme: { extend: { colors: { surface: { 100: "#f1f5f9", 400: "#94a3b8", 600: "#475569", 900: "#0f172a" } } } }, plugins: [] })]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined });
const script = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
const componentCss = bundle.outputFiles.find(file => file.path.endsWith(".css")).text;
const artifacts = path.join(repo, "output/playwright/shopping-correction-flexible");
await mkdir(artifacts, { recursive: true });
await writeFile(path.join(artifacts, "actual-ui.html"), `<!doctype html><html lang="id"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Koreksi daftar belanja · data contoh</title><style>${css.css}\n${componentCss}</style><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://127.0.0.1:3149/__correction-fixture", route => route.fulfill({ contentType: "text/html", body: '<html lang="id"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>' }));
  await page.route("http://127.0.0.1:3149/fonts/koreksi-pembayaran/*", async route => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    assert.match(name, /^(sora|source-sans-3)-latin(-ext)?\.woff2$/);
    await route.fulfill({ contentType: "font/woff2", body: await readFile(path.join(web, "public/fonts/koreksi-pembayaran", name)) });
  });
  await page.goto("http://127.0.0.1:3149/__correction-fixture");
  await page.addStyleTag({ content: `${css.css}\n${componentCss}` });
  await page.addScriptTag({ content: script });
  await page.getByRole("button", { name: "Buka koreksi contoh" }).click();
  await page.getByRole("heading", { name: "Perbaiki data daftar belanja" }).waitFor();
  const close = page.getByRole("button", { name: "Tutup modal" });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.getByRole("dialog").evaluate(element => element.contains(document.activeElement)), true, "Shift+Tab from close stays inside dialog");
  await page.getByLabel("Harga beli Kertas Contoh", { exact: true }).fill("8816156");
  await page.getByLabel("Nominal Pembayaran 1", { exact: true }).fill("4947500");
  await page.getByRole("button", { name: "Tambah jadwal", exact: true }).click();
  await page.getByLabel("Tanggal Jatuh Tempo 2", { exact: true }).fill("2026-12-05");
  await page.getByLabel("Catatan Pembayaran 2 (opsional)", { exact: true }).fill("Sisa belanja");
  await page.getByLabel("Alasan perubahan", { exact: true }).fill("Koreksi jadwal contoh");
  await page.getByRole("button", { name: "Tinjau dampak", exact: true }).click();
  await page.getByRole("button", { name: "Lanjutkan tinjau dampak" }).click();
  const reviewHeading = page.getByRole("heading", { name: "Tinjau dampak sebelum simpan", exact: true });
  await reviewHeading.waitFor();
  assert.equal(await reviewHeading.evaluate(element => document.activeElement === element), true);
  assert.ok(await page.getByText("Transfer + Giro", { exact: true }).count());
  assert.ok(await page.getByText("5 Desember 2026", { exact: true }).count());
  assert.equal(await page.getByText("Rincian perubahan:", { exact: false }).count(), 0);
  await page.screenshot({ path: path.join(artifacts, "desktop.png"), fullPage: true });
  const save = page.getByRole("button", { name: "Simpan perubahan", exact: true });
  await save.click();
  const error = page.getByRole("alert").filter({ hasText: "Koneksi terputus" });
  await error.waitFor();
  assert.equal(await error.evaluate(element => element === document.activeElement), true);
  await save.click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("button", { name: "Buka koreksi contoh" }).evaluate(element => element === document.activeElement), true, "focus restores to opener");
  const calls = await page.evaluate(() => ({ saves: window.saveCalls, previews: window.previewCalls }));
  assert.deepEqual(calls.saves[1], calls.saves[0], "retry uses the same reviewed payload and idempotency key");
  assert.equal(calls.saves[0].payment.schedule[1].amount, "3868656.00");
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: "Buka koreksi contoh" }).click();
    assert.equal(await page.getByRole("dialog").evaluate(element => element.scrollWidth <= element.clientWidth), true, `no modal overflow at ${width}px`);
    await page.getByLabel("Nominal Pembayaran 1", { exact: true }).fill("1");
    await page.getByLabel("Alasan perubahan", { exact: true }).fill("Periksa nominal");
    await page.getByRole("button", { name: "Tinjau dampak", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Total jadwal harus sesuai" }).waitFor();
    const amount = page.getByLabel("Nominal Pembayaran 1", { exact: true });
    await amount.focus();
    await amount.press("End");
    await amount.press("2");
    assert.equal(await amount.evaluate(element => document.activeElement === element), true, "correcting validation does not steal input focus");
    await amount.fill("1");
    await page.getByRole("button", { name: "Tinjau dampak", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Total jadwal harus sesuai" }).waitFor();
    assert.equal(await page.getByLabel("Alasan perubahan", { exact: true }).inputValue(), "Periksa nominal");
    await page.getByRole("button", { name: "Periksa pembayaran", exact: true }).click();
    assert.equal(await page.getByRole("region", { name: "Jadwal pembayaran", exact: true }).evaluate(element => element === document.activeElement), true);
    await page.screenshot({ path: path.join(artifacts, `mobile-${width}.png`), fullPage: true });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Ubah pembayaran contoh" }).click();
  await page.getByRole("heading", { name: "Periksa dan ubah pembayaran" }).waitFor();
  assert.equal(await page.getByLabel("Nama daftar", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("region", { name: "Jadwal pembayaran", exact: true }).evaluate(element => element === document.activeElement), true);
  assert.ok(await page.getByRole("complementary", { name: "Ringkasan perubahan" }).isVisible());
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => [...document.fonts].some(font => font.family === "Koreksi Sora" && font.status === "loaded")), true);
  await page.screenshot({ path: path.join(artifacts, "payment-desktop.png"), fullPage: true });
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.getByRole("dialog").evaluate(element => element.scrollWidth <= element.clientWidth), true, `no payment overflow at ${width}px`);
    await page.screenshot({ path: path.join(artifacts, `payment-mobile-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByLabel("Nominal Pembayaran 1", { exact: true }).fill("4947500");
  await page.getByRole("button", { name: "Tambah jadwal", exact: true }).click();
  await page.getByLabel("Tanggal Jatuh Tempo 2", { exact: true }).fill("2026-12-05");
  await page.getByLabel("Alasan perubahan", { exact: true }).fill("Sesuaikan metode pembayaran");
  await page.getByRole("heading", { name: "Periksa dan ubah pembayaran" }).scrollIntoViewIfNeeded();
  await page.getByRole("dialog").screenshot({ path: path.join(artifacts, "payment-mixed-dialog.png") });
  await page.evaluate(() => { window.conflictNext = true; });
  await page.getByRole("button", { name: "Tinjau dampak", exact: true }).click();
  await page.getByRole("button", { name: "Muat data terbaru", exact: true }).click();
  assert.equal(await page.getByLabel("Nominal Pembayaran 1", { exact: true }).inputValue(), "4947500");
  assert.equal(await page.getByLabel("Tanggal Jatuh Tempo 2", { exact: true }).inputValue(), "2026-12-05");
  assert.equal(await page.getByLabel("Alasan perubahan", { exact: true }).inputValue(), "Sesuaikan metode pembayaran");
  await page.getByRole("button", { name: "Tinjau dampak", exact: true }).click();
  await page.getByRole("heading", { name: "Tinjau dampak sebelum simpan", exact: true }).waitFor();
  const paymentPreview = await page.evaluate(() => window.previewCalls.at(-1));
  assert.equal(paymentPreview.expectedVersion, "editor-2");
  assert.equal(paymentPreview.payment.schedule[0].amount, "4947500.00");
  assert.equal(paymentPreview.payment.schedule[1].amount, "3988656.00");
  assert.deepEqual(errors, []);
  process.stdout.write("PASS: real correction UI, mixed schedule, focus trap/restore, retry, inline validation, mobile and keyboard.\n");
} finally {
  await browser.close();
}
