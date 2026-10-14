// node apps/web/features/product-stock-groups/__tests__/group-creation-browser.test.mjs
// Actual React drawer, real browser and in-memory API fixtures; no store mutations/server.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bundleReactHarness, repo } from "./browser-harness.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const products = [
  { id: "pcs", name: "Kertas", sku: "P", unit: "pcs", stock: 24 },
  { id: "dus", name: "Kertas dus", sku: "D", unit: "dus", stock: 8 },
];
const target = {
  id: "g",
  displayName: "Grup lama",
  baseUnit: "lembar",
  baseStock: 100,
  hasNegativeStock: false,
  variants: [
    {
      id: "lembar",
      name: "Lembar",
      sku: "L",
      unit: "lembar",
      stock: 100,
      unitMultiplierToBase: 1,
      price: 1,
    },
    {
      id: "rim",
      name: "Rim",
      sku: "R",
      unit: "rim",
      stock: 2,
      unitMultiplierToBase: 50,
      price: 1,
    },
  ],
};
const bundle = await bundleReactHarness(
  `import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {BulkStockGroupDrawer} from './features/product-stock-groups/components/BulkStockGroupDrawer';
    const products=${JSON.stringify(products)};
    function Harness(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Buka grup</button>
    <BulkStockGroupDrawer open={open} products={products} onClose={()=>setOpen(false)} onSaved={()=>window.saved++}/></>}
    window.saved=0; createRoot(document.getElementById('root')).render(<Harness/>);`,
  ["features/product-stock-groups/components/BulkStockGroupDrawer.tsx"],
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let failSave = true,
    failGroups = true,
    failDetail = true,
    emptyGroups = false,
    delayGroups = false,
    failProductReload = true,
    refreshedProducts = products,
    attempts = [];
  await page.route("http://localhost:3004/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/fixture")
      return route.fulfill({
        contentType: "text/html",
        body: '<html lang="id"><body><div id="root"></div></body></html>',
      });
    if (route.request().method() === "POST") {
      attempts.push(route.request().postDataJSON());
      await new Promise((r) => setTimeout(r, 120));
      return route.fulfill({
        status: failSave ? 409 : 200,
        json: failSave
          ? { message: "Data stok berubah. Muat ulang data." }
          : {},
      });
    }
    if (url.pathname === "/api/product-stock-groups/g")
      return route.fulfill({ status: failDetail ? 500 : 200, json: target });
    if (url.pathname.startsWith("/api/products/"))
      return route.fulfill({
        status: failProductReload ? 500 : 200,
        json: {
          data: refreshedProducts.find(
            (product) => product.id === url.pathname.split("/").at(-1),
          ),
        },
      });
    if (delayGroups) await new Promise(resolve => setTimeout(resolve, 500));
    return route.fulfill({
      status: failGroups ? 500 : 200,
      json: { data: emptyGroups ? [] : [{ ...target, variantCount: 2 }] },
    });
  });
  await page.goto("http://localhost:3004/fixture");
  await page.addStyleTag({ content: bundle.css });
  await page.addScriptTag({ content: bundle.script });
  const next = page.getByRole("button", { name: "Berikutnya", exact: true });
  await page.getByRole("button", { name: "Buka grup" }).click();
  await page
    .getByRole("heading", { name: "Tujuan grup", exact: true })
    .waitFor({ timeout: 3000 });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Buka grup" }).click();
  assert.equal(
    await page.getByLabel("Sumber stok", { exact: true }).count(),
    0,
  );
  await page.getByLabel("Nama grup", { exact: true }).fill("");
  await next.click();
  assert.equal(
    await page
      .getByLabel("Nama grup", { exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.getByLabel("Nama grup", { exact: true }).fill("Kertas bersama");
  await next.click();
  const quantity = page.getByLabel("Konversi Kertas dus", { exact: true });
  await quantity.fill("");
  await next.click();
  assert.equal(
    await quantity.evaluate((e) => e === document.activeElement),
    true,
  );
  await quantity.fill("12");
  await page.getByLabel("Sumber stok", { exact: true }).selectOption("dus");
  assert.ok(
    Math.abs(
      Number(
        await page.getByLabel("Konversi Kertas", { exact: true }).inputValue(),
      ) -
        1 / 12,
    ) < 1e-9,
  );
  await page.getByLabel("Sumber stok", { exact: true }).selectOption("pcs");
  assert.equal(await quantity.inputValue(), "12");
  await page.getByRole("button", { name: "Kembali", exact: true }).click();
  assert.equal(
    await page.getByLabel("Nama grup", { exact: true }).inputValue(),
    "Kertas bersama",
  );
  await next.click();
  assert.equal(await quantity.inputValue(), "12");
  await next.click();
  await page.getByText("Sekarang: 8 dus").waitFor();
  await page.getByText("Setelah disimpan: 2 dus").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Lanjutkan mengedit" }).click();
  assert.equal(
    await page
      .getByRole("heading", { name: "Tinjau dan simpan", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  const save = page.getByRole("button", {
    name: "Buat grup stok",
    exact: true,
  });
  await save.dblclick();
  await page
    .getByRole("alert")
    .filter({ hasText: "Data stok berubah" })
    .waitFor();
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].sharedStock, 24);
  assert.equal(attempts[0].conversionPairs[0].toQuantity, 12);
  assert.equal(
    await save.isDisabled(),
    true,
    "conflict blocks another save until current data is reviewed",
  );
  await page
    .getByRole("button", { name: "Muat ulang data dan tinjau konversi" })
    .click();
  await page
    .getByText("Gagal memuat ulang produk. Draft Anda tetap tersimpan.")
    .waitFor();
  assert.equal(await save.isDisabled(), true);
  failProductReload = false;
  await page
    .getByRole("button", { name: "Muat ulang data dan tinjau konversi" })
    .click();
  await quantity.waitFor();
  assert.equal(await quantity.inputValue(), "12");
  await page.getByRole("button", { name: "Kembali", exact: true }).click();
  assert.equal(
    await page.getByLabel("Nama grup", { exact: true }).inputValue(),
    "Kertas bersama",
  );
  await next.click();
  await next.click();
  failSave = false;
  await save.click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByRole("button", { name: "Buka grup" })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  assert.equal(await page.evaluate(() => window.saved), 1);
  console.log(
    "PASS new: stage validation, back/draft, rebase, preview, dirty Escape, failed save/retry, duplicate guard, focus restore.",
  );
  await page.getByRole("button", { name: "Buka grup" }).click();
  await page
    .getByRole("button", { name: "Gabungkan ke grup yang ada" })
    .click();
  await page.getByText("Gagal memuat grup stok").waitFor();
  failGroups = false;
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await page.getByLabel("Grup tujuan", { exact: true }).selectOption("g");
  await page.getByText("Gagal memuat detail grup tujuan").waitFor();
  failDetail = false;
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await page.getByText("Satuan acuan: lembar").waitFor();
  await next.click();
  await page.getByLabel("Konversi Kertas", { exact: true }).fill("1");
  await page.getByLabel("Konversi Kertas dus", { exact: true }).fill("12");
  await next.click();
  await page.getByText("Setelah disimpan: 100 lembar").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Gabungkan ke grup stok", exact: true })
      .isEnabled(),
    true,
  );
  failSave = true;
  await page
    .getByRole("button", { name: "Gabungkan ke grup stok", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Muat ulang data dan tinjau konversi" })
    .waitFor();
  target.baseStock = 150;
  target.variants[0].stock = 150;
  target.variants[1].stock = 3;
  await page
    .getByRole("button", { name: "Muat ulang data dan tinjau konversi" })
    .click();
  await quantity.waitFor();
  assert.equal(await quantity.inputValue(), "12");
  await next.click();
  await page.getByText("Setelah disimpan: 150 lembar").waitFor();
  await page.getByText("Setelah disimpan: 3 rim").waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  const buttons = await page
    .locator("dialog button")
    .evaluateAll((es) =>
      es
        .filter((e) => e.offsetHeight > 0)
        .map((e) => e.getBoundingClientRect().height),
    );
  assert.ok(buttons.every((height) => height >= 44));
  await mkdir(path.join(repo, "output/playwright/group-creation"), {
    recursive: true,
  });
  await page.screenshot({
    path: path.join(repo, "output/playwright/group-creation/review-mobile.png"),
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: path.join(
      repo,
      "output/playwright/group-creation/review-desktop.png",
    ),
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Buang perubahan" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  console.log(
    "PASS existing: list/detail error + retry, old-member preview, mobile sizing/targets, dirty discard.",
  );
  emptyGroups = true;
  await page.getByRole("button", { name: "Buka grup" }).click();
  await page
    .getByRole("button", { name: "Gabungkan ke grup yang ada" })
    .click();
  await page
    .getByText("Belum ada grup stok. Pilih Buat grup baru untuk memulai.")
    .waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  console.log("PASS empty destination and clean/navigation-only Escape.");
  await page.getByRole("button", { name: "Buka grup" }).click();
  await next.click();
  await quantity.fill("12");
  await next.click();
  await save.click();
  await page
    .getByRole("button", { name: "Muat ulang data dan tinjau konversi" })
    .waitFor();
  refreshedProducts = [
    { ...products[0], stock: 36 },
    { ...products[1], unit: "karton" },
  ];
  await page
    .getByRole("button", { name: "Muat ulang data dan tinjau konversi" })
    .click();
  await page
    .getByText(
      "Data terbaru dimuat. Satuan berubah; isi ulang konversi yang dikosongkan sebelum melanjutkan.",
    )
    .waitFor();
  assert.equal(await quantity.inputValue(), "");
  await next.click();
  assert.equal(
    await quantity.evaluate((e) => e === document.activeElement),
    true,
  );
  console.log(
    "PASS refresh: target current stock, same-unit draft, changed-unit clearing and blocked incomplete review.",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Buang perubahan" }).click();
  delayGroups = true;
  await page.getByRole("button", { name: "Buka grup" }).click();
  await page.getByRole("button", { name: "Gabungkan ke grup yang ada" }).click();
  await page.getByText("Memuat grup tujuan...").waitFor();
  await page.getByRole("button", { name: "Buat grup baru", exact: true }).click();
  await next.click(); await quantity.fill("12"); await next.click();
  assert.equal(await save.isEnabled(), true, "canceled destination loading cannot block new-group save");
  console.log("PASS destination cancellation: switching to new group clears stale loading.");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
