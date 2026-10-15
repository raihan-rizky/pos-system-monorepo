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
const params=new URLSearchParams(location.search);const client=new QueryClient({defaultOptions:{queries:{retry:params.has('initial-failure')?2:false,retryDelay:10}}}); function Harness(){const[open,setOpen]=useState(false);return <QueryClientProvider client={client}><button onClick={()=>setOpen(true)}>Buka grup</button>{open&&<StockGroupWorkspaceModal stockGroupId="group-1" canUpdateStock canUpdateProducts canCreateProducts canRequestStockChange={!params.has('no-inventory-access')} onClose={()=>setOpen(false)} onSaved={()=>{window.saved++}}/>}</QueryClientProvider>}window.saved=0;createRoot(document.getElementById('root')).render(<Harness/>);`,
  [
    "features/product-stock-groups/components/StockGroupWorkspace.tsx",
    "features/product-stock-groups/components/WorkspacePanels.tsx",
    "features/product-stock-groups/components/StockGroupHistory.tsx",
  ],
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const scenario of ["initial-failure", "inventory", "no-inventory-access"]) {
    if (process.argv[2] && process.argv[2] !== scenario) continue;
    const nextPage = await browser.newPage();
    let detailRequests = 0;
    let failInitial = scenario === "initial-failure";
    await nextPage.route("http://localhost:3004/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/fixture" || url.pathname === "/inventory") {
        return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>' });
      }
      detailRequests++;
      return route.fulfill({ status: failInitial ? 500 : 200, json: failInitial ? { message: "Gangguan sementara" } : detail });
    });
    await nextPage.goto(`http://localhost:3004/fixture?${scenario}`);
    await nextPage.addStyleTag({ content: bundle.css });
    await nextPage.addScriptTag({ content: bundle.script });
    await nextPage.getByRole("button", { name: "Buka grup" }).click();
    if (scenario === "initial-failure") {
      await nextPage.getByRole("alert").filter({ hasText: "Gagal memuat grup stok" }).waitFor();
      assert.equal(detailRequests, 3, "initial GET must exhaust the configured two retries");
      failInitial = false;
      await nextPage.getByRole("button", { name: "Coba lagi", exact: true }).click();
      await nextPage.getByRole("tab", { name: "Ringkasan", exact: true }).waitFor({ timeout: 5000 });
      assert.equal(detailRequests, 4, "Coba lagi must issue a new GET after query retries are exhausted");
      await nextPage.getByRole("heading", { name: "Kertas", exact: true }).waitFor();
    } else {
      await nextPage.getByRole("tab", { name: "Ringkasan", exact: true }).waitFor();
      const handoff = nextPage.getByRole("link", { name: "Ajukan perubahan stok di Inventori", exact: true });
      if (scenario === "no-inventory-access") {
        assert.equal(await handoff.count(), 0, "handoff must require Inventory access");
      } else {
        await handoff.waitFor({ timeout: 5000 });
        assert.equal(await handoff.getAttribute("href"), "/inventory");
        await nextPage.getByRole("button", { name: "Tetapkan stok akhir", exact: true }).click();
        await nextPage.getByLabel("Jumlah akhir").fill("80");
        await handoff.click();
        await nextPage.getByRole("button", { name: "Lanjutkan mengedit" }).click();
        assert.equal(new URL(nextPage.url()).pathname, "/fixture", "cancel must keep the workspace open");
        assert.equal(await nextPage.getByLabel("Jumlah akhir").inputValue(), "80", "cancel must preserve the draft");
        await handoff.click();
        await nextPage.getByRole("button", { name: "Buang perubahan dan buka Inventori", exact: true }).click();
        await nextPage.waitForURL("**/inventory");
        await nextPage.goto("http://localhost:3004/fixture?inventory");
        await nextPage.addScriptTag({ content: bundle.script });
        await nextPage.getByRole("button", { name: "Buka grup" }).click();
        await handoff.click();
        await nextPage.waitForURL("**/inventory");
      }
    }
    console.log(`PASS ${scenario}: actual workspace interaction`);
    await nextPage.close();
  }
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
  for (const scenario of ["dirty", "pristine", "direct", "invalid-margin", "pending-refresh", "failed-refresh", "failed-reopen"]) {
    if (process.argv[2] && process.argv[2] !== scenario) continue;
    const nextPage = await browser.newPage();
    const current = structuredClone(detail);
    let conversionRequests = 0;
    let stockPayload;
    const refreshGuard = scenario === "pending-refresh" || scenario === "failed-refresh" || scenario === "failed-reopen";
    let failDetail = scenario === "failed-refresh" || scenario === "failed-reopen";
    let holdReopen = false, releaseReopen, observeReopen;
    const reopenDetail = new Promise((resolve) => { releaseReopen = resolve; });
    const reopenRequested = new Promise((resolve) => { observeReopen = resolve; });
    let releaseDetail;
    const detailRefresh = new Promise((resolve) => { releaseDetail = resolve; });
    await nextPage.route("http://localhost:3004/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>' });
      if (request.method() === "PATCH" && url.pathname.endsWith("/conversion")) {
        conversionRequests++;
        const payload = request.postDataJSON();
        if (payload.baseProductId === "pack") {
          current.baseUnit = "pack";
          current.baseStock = 12;
          for (const v of current.variants) v.unitMultiplierToBase /= 10;
        } else current.variants.find((v) => v.id === "pack").unitMultiplierToBase = 20;
        for (const v of current.variants) v.stock = current.baseStock / v.unitMultiplierToBase;
        return route.fulfill({ json: {} });
      }
      if (request.method() === "PATCH" && url.pathname === "/api/product-stock-groups/group-1") {
        stockPayload = request.postDataJSON();
        return route.fulfill({ json: {} });
      }
      if ((scenario === "direct" || refreshGuard) && conversionRequests) await detailRefresh;
      if (holdReopen) {
        observeReopen();
        await reopenDetail;
      }
      if (conversionRequests && failDetail) return route.fulfill({ status: 500, json: { message: "Refresh gagal" } });
      return route.fulfill({ json: current });
    });
    await nextPage.goto("http://localhost:3004/fixture");
    await nextPage.addStyleTag({ content: bundle.css });
    await nextPage.addScriptTag({ content: bundle.script });
    await nextPage.getByRole("button", { name: "Buka grup" }).click();
    await nextPage.getByRole("tab", { name: "Ringkasan", exact: true }).waitFor();
    if (scenario === "invalid-margin") {
      await nextPage.getByRole("tab", { name: "Harga", exact: true }).click();
      const price = nextPage.getByRole("group", { name: "Harga pcs" });
      await price.getByLabel("HPP (opsional)", { exact: true }).fill("-5");
      assert.equal(await price.getByText(/^Margin Rp/).count(), 0, "negative HPP must not display profit");
      assert.equal(await price.getByText(/HPP belum diisi/).count(), 0);
      await price.getByText("Periksa harga jual dan HPP sebelum menghitung margin.").waitFor();
      await price.getByLabel("HPP (opsional)", { exact: true }).fill("5");
      await price.getByLabel("Harga jual", { exact: true }).fill("-1");
      assert.equal(await price.getByText(/^Margin Rp/).count(), 0, "negative price must not display margin");
    } else {
      if (scenario === "dirty" || refreshGuard) {
        await nextPage.getByRole("button", { name: "Tetapkan stok akhir", exact: true }).click();
        await nextPage.getByLabel("Jumlah akhir").fill("80");
      }
      if (refreshGuard) {
        await nextPage.getByRole("tab", { name: "Harga", exact: true }).click();
        await nextPage.getByRole("group", { name: "Harga pack" }).getByLabel("Harga jual", { exact: true }).fill("9900");
      }
      await nextPage.getByRole("tab", { name: "Satuan", exact: true }).click();
      if (scenario === "direct") await nextPage.getByLabel("Jumlah setara", { exact: true }).fill("20");
      else await nextPage.getByLabel("Satuan acuan", { exact: true }).selectOption("pack");
      await nextPage.getByRole("button", { name: "Simpan konversi satuan", exact: true }).click();
      await nextPage.getByText("Konversi satuan tersimpan", { exact: true }).waitFor();
      if (refreshGuard) {
        await nextPage.getByRole("tab", { name: "Ringkasan", exact: true }).click();
        const saveStock = nextPage.getByRole("button", { name: "Simpan stok akhir", exact: true });
        assert.equal(await saveStock.isDisabled(), true, "stock save must stay blocked until authoritative conversion detail arrives");
        await saveStock.evaluate((el) => el.click());
        assert.equal(stockPayload, undefined, "pending refresh must not submit stale BASE stock");
        await nextPage.getByText("Memuat data satuan terbaru...").waitFor();
        releaseDetail();
        if (failDetail) {
          await nextPage.getByText("Konversi tersimpan, tetapi data satuan terbaru belum berhasil dimuat.", { exact: false }).waitFor();
          assert.equal(await saveStock.isDisabled(), true, "failed refresh must keep stale unit actions blocked");
          await saveStock.evaluate((el) => el.click());
          assert.equal(stockPayload, undefined);
          await nextPage.getByRole("tab", { name: "Satuan", exact: true }).click();
          const saveConversion = nextPage.getByRole("button", { name: "Simpan konversi satuan", exact: true });
          assert.equal(await saveConversion.isDisabled(), true, "failed refresh must block another conversion");
          await nextPage.getByRole("tab", { name: "Tambah satuan", exact: true }).click();
          const addUnit = nextPage.getByRole("button", { name: "Tambah satuan", exact: true });
          assert.equal(await addUnit.isDisabled(), true, "failed refresh must block unit addition");
          await nextPage.getByRole("tab", { name: "Harga", exact: true }).click();
          const price = nextPage.getByRole("group", { name: "Harga pack" });
          assert.equal(await price.getByLabel("Harga jual", { exact: true }).inputValue(), "9900");
          assert.equal(await price.getByLabel("Harga jual", { exact: true }).isEnabled(), true);
          assert.equal(await price.getByRole("button", { name: "Simpan harga pack", exact: true }).isEnabled(), true);
          failDetail = false;
          if (scenario === "failed-reopen") {
            await nextPage.getByRole("button", { name: "Tutup", exact: true }).click();
            await nextPage.getByRole("button", { name: "Buang perubahan", exact: true }).click();
            holdReopen = true;
            await nextPage.getByRole("button", { name: "Buka grup", exact: true }).click();
            assert.equal(await nextPage.getByRole("tab", { name: "Ringkasan", exact: true }).count(), 0, "reopening after failed conversion refresh must not expose stale unit actions");
            assert.equal(stockPayload, undefined);
            await reopenRequested;
            releaseReopen();
            await nextPage.getByRole("tab", { name: "Ringkasan", exact: true }).waitFor();
            await nextPage.getByRole("button", { name: "Tetapkan stok akhir", exact: true }).click();
            assert.equal(await nextPage.getByLabel("Jumlah akhir").inputValue(), "12");
            assert.equal(conversionRequests, 1);
            await nextPage.close();
            console.log(`PASS conversion regression ${scenario}`);
            continue;
          }
          await nextPage.getByRole("button", { name: "Coba muat ulang satuan", exact: true }).click();
          await nextPage.getByRole("tab", { name: "Ringkasan", exact: true }).click();
        }
        await nextPage.getByText("1 pcs = 0,1 pack", { exact: false }).waitFor();
        assert.equal(await nextPage.getByLabel("Jumlah akhir").inputValue(), "8");
        await saveStock.click();
        await nextPage.getByText("Stok akhir tersimpan", { exact: true }).waitFor();
        assert.equal(stockPayload.sharedStock, 8);
        assert.equal(stockPayload.stockInput.mode, "BASE");
        assert.equal(conversionRequests, 1, "refresh retry must not repeat the conversion mutation");
        await nextPage.close();
        console.log(`PASS conversion regression ${scenario}`);
        continue;
      }
      if (scenario === "direct") {
        assert.equal(await nextPage.getByRole("button", { name: "Simpan konversi satuan", exact: true }).isDisabled(), true, "acknowledged conversion must not resubmit during refetch");
        releaseDetail();
      }
      await nextPage.getByRole("tab", { name: "Ringkasan", exact: true }).click();
      await nextPage.getByText(scenario === "direct" ? "1 pack = 20 pcs" : "1 pcs = 0,1 pack", { exact: false }).waitFor();
      if (scenario === "direct") {
        await nextPage.getByRole("tab", { name: "Satuan", exact: true }).click();
        await nextPage.getByText("Pengaturan lanjutan", { exact: true }).click();
        const multiplier = nextPage.getByLabel("1 pack = jumlah pcs", { exact: true });
        assert.equal(await multiplier.inputValue(), "20", "advanced draft must use saved pair conversion");
        assert.equal(await nextPage.getByRole("button", { name: "Simpan konversi satuan", exact: true }).isDisabled(), true, "opening disclosure must not enable an unchanged save");
        assert.equal(conversionRequests, 1);
        await multiplier.fill("22");
        await nextPage.getByText("Pengaturan lanjutan", { exact: true }).click();
        await nextPage.getByText("Pengaturan lanjutan", { exact: true }).click();
        assert.equal(await multiplier.inputValue(), "22", "user-entered direct draft must survive disclosure toggles");
      } else {
        if (scenario === "pristine") await nextPage.getByRole("button", { name: "Tetapkan stok akhir", exact: true }).click();
        assert.equal(await nextPage.getByLabel("Jumlah akhir").inputValue(), scenario === "dirty" ? "8" : "12", `${scenario} stock must follow the refreshed unit context`);
        const saveStock = nextPage.getByRole("button", { name: "Simpan stok akhir", exact: true });
        assert.equal(await saveStock.isDisabled(), scenario === "pristine");
        if (scenario === "dirty") {
          await saveStock.click();
          await nextPage.getByText("Stok akhir tersimpan", { exact: true }).waitFor();
          assert.equal(stockPayload.sharedStock, 8);
          assert.equal(stockPayload.stockInput.mode, "BASE");
        }
      }
    }
    await nextPage.close();
    console.log(`PASS conversion regression ${scenario}`);
  }
  console.log(
    "PASS workspace actual React interaction, independent drafts, keyboard, stock unit, conflict, history and mobile/desktop",
  );
} finally {
  await browser.close();
}
