import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { bundleReactHarness, web } from "../../product-stock-groups/__tests__/browser-harness.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const bundle = await bundleReactHarness(`
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { PriceRoundingSettingsView } from './features/product-price-rounding/components/PriceRoundingSettingsTab';
  const categories = [{id:'paper',name:'Kertas'}, {id:'drink',name:'Minuman'}, {id:'ink',name:'Tinta'}];
  function Harness() {
    const [settings,setSettings] = useState({enabled:true,increment:500,threshold:50,excludedCategoryIds:[]});
    const [saved,setSaved] = useState(false);
    return <main className="mx-auto max-w-2xl bg-white p-5"><p className="mb-4 text-xs font-bold text-brand-700">DATA CONTOH</p>
      <PriceRoundingSettingsView settings={settings} canUpdate isLoading={false} isUpdating={false} error={null} success={saved} categories={categories}
        onChange={next=>{setSettings(next);setSaved(false)}} onSubmit={()=>{window.saved=settings;setSaved(true)}} />
    </main>;
  }
  createRoot(document.getElementById('root')).render(<Harness/>);
`, ["features/product-price-rounding/components/PriceRoundingSettingsTab.tsx", "features/product-price-rounding/__tests__/category-settings-browser.test.mjs"]);

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [1280, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 1200 }, isMobile: width === 375, hasTouch: width === 375 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://localhost:3022/**", route => route.fulfill({ contentType: "text/html", body: '<html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#f8fafc"><div id="root"></div></body></html>' }));
    await page.goto("http://localhost:3022/fixture");
    await page.addStyleTag({ content: bundle.css });
    await page.addScriptTag({ content: bundle.script });
    const search = page.getByRole("searchbox", { name: "Cari kategori" });
    await search.fill("kertas");
    const paper = page.getByRole("checkbox", { name: "Kertas" });
    await paper.focus();
    await page.keyboard.press("Space");
    assert.equal(await paper.isChecked(), true);
    await search.fill("minum");
    await page.getByRole("checkbox", { name: "Minuman" }).check();
    await search.fill("");
    assert.equal(await page.getByRole("checkbox", { name: "Kertas" }).isChecked(), true);
    assert.match(await page.locator("main").innerText(), /2 kategori dipilih/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    if (width === 1280) await page.locator("main").screenshot({ path: path.join(web, "public/images/changelog/pengecualian-kategori-pembulatan.png") });
    await page.getByRole("button", { name: "Simpan pengaturan" }).click();
    assert.deepEqual(await page.evaluate(() => window.saved.excludedCategoryIds), ["paper", "drink"]);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: search, keyboard, multiple selection, save and no overflow`);
    await page.close();
  }
} finally { await browser.close(); }
