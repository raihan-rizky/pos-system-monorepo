import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bundleReactHarness, repo } from "./browser-harness.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const detail = {
  id: "group-1",
  displayName: "Kertas",
  baseUnit: "pcs",
  baseStock: 120,
  hasNegativeStock: false,
  variants: [
    {
      id: "pcs",
      name: "Kertas",
      sku: "P",
      unit: "pcs",
      unitMultiplierToBase: 1,
      stock: 120,
      price: 1000,
      costPrice: null,
      conversionNeedsReview: false,
    },
    {
      id: "pack",
      name: "Kertas",
      sku: "K",
      unit: "pack",
      unitMultiplierToBase: 10,
      stock: 12,
      price: 9000,
      costPrice: 5000,
      conversionNeedsReview: false,
    },
    {
      id: "dus",
      name: "Kertas",
      sku: "D",
      unit: "dus",
      unitMultiplierToBase: 40,
      stock: 3,
      price: 30000,
      costPrice: 20000,
      conversionNeedsReview: false,
    },
  ],
};
const bundle = await bundleReactHarness(
  `import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {QueryClient,QueryClientProvider} from '@tanstack/react-query'; import {StockGroupWorkspaceModal} from './features/product-stock-groups/components/StockGroupWorkspace';
const client=new QueryClient({defaultOptions:{queries:{retry:false}}}); function Harness(){const[open,setOpen]=useState(false);return <QueryClientProvider client={client}><button onClick={()=>setOpen(true)}>Buka grup</button>{open&&<StockGroupWorkspaceModal stockGroupId="group-1" canUpdateStock canUpdateProducts canCreateProducts onClose={()=>setOpen(false)} onSaved={()=>{window.saved++}}/>}</QueryClientProvider>}window.saved=0;createRoot(document.getElementById('root')).render(<Harness/>);`,
  [
    "features/product-stock-groups/components/StockGroupWorkspace.tsx",
    "features/product-stock-groups/components/WorkspacePanels.tsx",
    "features/product-stock-groups/components/StockGroupHistory.tsx",
  ],
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let failPrice = false,
    failHistory = true,
    historyDelay = false,
    delayedRoute = null;
  const mutations = [],
    historyUrls = [];
  await page.route("http://localhost:3004/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname === "/fixture")
      return route.fulfill({
        contentType: "text/html",
        body: '<html lang="id"><body><div id="root"></div></body></html>',
      });
    if (url.pathname.endsWith("/history")) {
      historyUrls.push(url.pathname + url.search);
      if (historyDelay && url.searchParams.get("tab") === "activity") {
        delayedRoute = route;
        return;
      }
      return route.fulfill({
        status: failHistory ? 500 : 200,
        json: {
          data: [
            {
              id:
                url.searchParams.get("tab") === "conversion"
                  ? "conv"
                  : "activity",
              type: "CONVERSION_RATE_CHANGED",
              person: "Rina",
              createdAt: "2026-10-14T00:00:00Z",
              note:
                url.searchParams.get("tab") === "conversion"
                  ? "Konversi terbaru"
                  : "Aktivitas lama",
              before: { baseUnit: "pcs", baseStock: 100 },
              after: { baseUnit: "pcs", baseStock: 120 },
            },
          ],
          pagination: {
            page: Number(url.searchParams.get("page")),
            limit: 20,
            total: 21,
            totalPages: 2,
            hasNextPage: url.searchParams.get("page") === "1",
            hasPreviousPage: url.searchParams.get("page") === "2",
          },
        },
      });
    }
    if (request.method() !== "GET") {
      mutations.push({ url: url.pathname, payload: request.postDataJSON() });
      await new Promise((r) => setTimeout(r, 180));
      if (failPrice)
        return route.fulfill({
          status: 409,
          json: { message: "Data berubah. Muat ulang data." },
        });
      if (url.pathname.endsWith("/pricing")) {
        const v = detail.variants.find(
          (v) => v.id === url.pathname.split("/").at(-2),
        );
        Object.assign(v, request.postDataJSON());
      }
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ json: detail });
  });
  await page.goto("http://localhost:3004/fixture");
  await page.addStyleTag({ content: bundle.css });
  await page.addScriptTag({ content: bundle.script });
  await page.getByRole("button", { name: "Buka grup" }).click();
  await page.getByRole("tab", { name: "Ringkasan", exact: true }).waitFor();
  const dialog = page.getByRole("dialog", { name: "Grup stok Kertas" });
  await dialog.waitFor();
  await page.getByRole("tab", { name: "Ringkasan", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await page
    .getByRole("tab", { name: "Satuan", exact: true })
    .evaluate((el) => {
      if (document.activeElement !== el) throw new Error("Arrow key focus");
    });
  await page.keyboard.press("End");
  await page
    .getByRole("tab", { name: "Riwayat", exact: true })
    .evaluate((el) => {
      if (document.activeElement !== el) throw new Error("End focus");
    });
  await page.keyboard.press("Home");
  await page
    .getByRole("button", { name: "Tetapkan stok akhir", exact: true })
    .click();
  await page.getByLabel("Jumlah akhir").fill("80");
  await page.getByLabel("Satuan input").selectOption("dus");
  assert.equal(await page.getByLabel("Jumlah akhir").inputValue(), "2");
  await page.getByRole("tab", { name: "Harga", exact: true }).click();
  await page.getByText("HPP belum diisi", { exact: false }).waitFor();
  const pcs = page.getByRole("group", { name: "Harga pcs" }),
    pack = page.getByRole("group", { name: "Harga pack" });
  await pcs.getByLabel("Harga jual", { exact: true }).fill("1100");
  await pack.getByLabel("Harga jual", { exact: true }).fill("9900");
  await page.getByRole("tab", { name: "Tambah satuan", exact: true }).click();
  await page.getByLabel("Nama satuan").fill("palet");
  await page.getByLabel("Harga jual", { exact: true }).fill("50000");
  await page.getByLabel("Jumlah satuan setara").fill("2");
  await page.getByLabel("Satuan setara", { exact: true }).selectOption("dus");
  assert.equal(await page.getByLabel("Stok dari grup").inputValue(), "1.5");
  assert.equal(
    await page.getByLabel("Stok dari grup").getAttribute("readonly"),
    "",
  );
  await page.getByRole("tab", { name: "Satuan", exact: true }).click();
  await page.getByLabel("Jumlah setara", { exact: true }).fill("20");
  await page.getByRole("tab", { name: "Harga", exact: true }).click();
  await pcs.getByRole("button", { name: "Simpan harga pcs" }).click();
  await pcs.getByText("Harga pcs tersimpan").waitFor();
  assert.equal(
    await pack.getByLabel("Harga jual", { exact: true }).inputValue(),
    "9900",
  );
  await page.getByRole("tab", { name: "Ringkasan", exact: true }).click();
  assert.equal(await page.getByLabel("Jumlah akhir").inputValue(), "2");
  await page.getByRole("tab", { name: "Tambah satuan", exact: true }).click();
  assert.equal(await page.getByLabel("Nama satuan").inputValue(), "palet");
  await page.getByRole("tab", { name: "Satuan", exact: true }).click();
  assert.equal(
    await page.getByLabel("Jumlah setara", { exact: true }).inputValue(),
    "20",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Lanjutkan mengedit" }).click();
  assert.equal(
    await page.getByLabel("Jumlah setara", { exact: true }).inputValue(),
    "20",
  );
  await page.getByRole("tab", { name: "Harga", exact: true }).click();
  failPrice = true;
  await pack.getByRole("button", { name: "Simpan harga pack" }).click();
  await pack.getByText("Data berubah. Muat ulang data.").waitFor();
  await page
    .getByRole("button", { name: "Muat ulang data", exact: true })
    .click();
  await page.getByRole("button", { name: "Lanjutkan mengedit" }).click();
  assert.equal(
    await pack.getByLabel("Harga jual", { exact: true }).inputValue(),
    "9900",
  );
  failPrice = false;
  await page.getByRole("tab", { name: "Riwayat", exact: true }).click();
  await page
    .getByText("Gagal memuat riwayat grup.", { exact: false })
    .waitFor();
  failHistory = false;
  await page.getByRole("button", { name: "Coba lagi" }).click();
  await page.getByText("Aktivitas lama", { exact: true }).waitFor();
  await page.getByLabel("Tampilkan riwayat").selectOption("conversion");
  await page.getByText("Konversi terbaru", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Berikutnya" }).click();
  await page.getByText("Halaman 2 dari 2").waitFor();
  assert(
    historyUrls.includes(
      "/api/product-stock-groups/group-1/history?tab=conversion&page=2&limit=20",
    ),
  );
  historyDelay = true;
  await page.getByLabel("Tampilkan riwayat").selectOption("activity");
  await page.getByLabel("Tampilkan riwayat").selectOption("conversion");
  await page.getByText("Konversi terbaru", { exact: true }).waitFor();
  if (delayedRoute)
    await delayedRoute
      .fulfill({
        json: {
          data: [
            {
              id: "late",
              type: "GROUP_CREATED",
              createdAt: "2026-10-14T00:00:00Z",
              note: "Respons usang",
            },
          ],
          pagination: { page: 1, totalPages: 1 },
        },
      })
      .catch(() => {});
  assert.equal(await page.getByText("Respons usang").count(), 0);
  const out = path.join(repo, "output", "stock-group-workspace");
  await mkdir(out, { recursive: true });
  await page.getByRole("tab", { name: "Ringkasan", exact: true }).click();
  await page.screenshot({ path: path.join(out, "workspace-375.png") });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(out, "workspace-1280.png") });
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await page
    .getByRole("button", { name: "Buang perubahan", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: "Buka grup" })
      .evaluate((el) => document.activeElement === el),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS workspace actual React interaction, independent drafts, keyboard, stock unit, conflict, history and mobile/desktop",
  );
} finally {
  await browser.close();
}
