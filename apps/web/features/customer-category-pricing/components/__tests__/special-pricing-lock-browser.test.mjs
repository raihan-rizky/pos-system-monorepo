import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { bundleReactHarness } from "../../../product-stock-groups/__tests__/browser-harness.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const bundle = await bundleReactHarness(`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {RoleProvider} from './components/providers/RoleProvider';
import {CustomerCategoryPricingRulesTab} from './features/customer-category-pricing/components/CustomerCategoryPricingRulesTab';
import {SpecialPricingRestrictedNotice} from './features/customer-category-pricing/components/SpecialPricingRestrictedNotice';
const client = new QueryClient({defaultOptions:{queries:{retry:false,refetchInterval:false}}});
window.pricingQueryClient = client;
const isAdmin=location.search.includes('admin');
createRoot(document.getElementById('root')).render(<RoleProvider role={isAdmin?'ADMIN':'OWNER'} userId='fixture' userName='Contoh'><QueryClientProvider client={client}><button>Sebelum aturan</button>{isAdmin?<SpecialPricingRestrictedNotice/>:<CustomerCategoryPricingRulesTab/>}<button>Setelah aturan</button></QueryClientProvider></RoleProvider>);
`, [
  "features/customer-category-pricing/components/CustomerCategoryPricingRulesTab.tsx",
  "features/customer-category-pricing/components/SpecialPricingRestrictedNotice.tsx",
  "features/customer-category-pricing/components/PricingRuleForm.tsx",
  "../../packages/ui/src/Modal.tsx",
]);

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [375, 1280]) {
    let setting = "disabled";
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("http://localhost:3021/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><script>window.process={env:{}};</script><div id="root"></div></body></html>' });
      if (url.pathname === "/api/settings/special-pricing") {
        return setting === "error" ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { enabled: setting === "enabled" } });
      }
      if (url.pathname === "/api/customer-category-pricing-rules") return route.fulfill({ json: { data: [{ id: "rule", categoryId: "paper", category: { id: "paper", name: "Kertas contoh" }, unit: "rim", customerTypes: ["AGEN"], mode: "PERCENT_DISCOUNT", value: 10, isActive: true }] } });
      return route.fulfill({ json: { data: [] } });
    });
    await page.goto("http://localhost:3021/fixture");
    await page.addStyleTag({ content: bundle.css });
    await page.addScriptTag({ content: bundle.script });
    await page.getByText("Fitur Harga Khusus dinonaktifkan.").waitFor({ timeout: 10000 }).catch(async error => {
      console.error({ width, errors, body: (await page.locator("body").innerText()).slice(0, 1200) });
      throw error;
    });
    const ownerLink = page.getByRole("link", { name: "Buka Pengaturan" });
    assert.equal(await ownerLink.getAttribute("href"), "/settings?tab=special-pricing");
    assert.equal(await page.locator("[inert]").count(), 1);
    await page.getByRole("button", { name: "Sebelum aturan" }).focus();
    await page.keyboard.press("Tab");
    assert.equal(await ownerLink.evaluate(element => element === document.activeElement), true);
    await page.keyboard.press("Tab");
    assert.equal(await page.getByRole("button", { name: "Setelah aturan" }).evaluate(element => element === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

    setting = "enabled";
    await page.evaluate(() => window.pricingQueryClient.invalidateQueries({ queryKey: ["settings", "special-pricing"] }));
    await page.getByRole("button", { name: "Tambah aturan" }).click();
    await page.getByRole("dialog").waitFor();
    setting = "disabled";
    await page.evaluate(() => window.pricingQueryClient.invalidateQueries({ queryKey: ["settings", "special-pricing"] }));
    await page.getByText("Fitur Harga Khusus dinonaktifkan.").waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0, "dialog closes as soon as the setting disables the feature");

    setting = "error";
    await page.evaluate(() => window.pricingQueryClient.invalidateQueries({ queryKey: ["settings", "special-pricing"] }));
    await page.getByText("Pengaturan Harga Khusus belum dapat dimuat.").waitFor();
    assert.equal(await page.locator("[inert]").count(), 1);
    setting = "enabled";
    await page.getByRole("button", { name: "Coba lagi" }).click();
    await page.getByRole("button", { name: "Tambah aturan" }).waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0, "re-enabling does not reopen the old dialog");
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${width}px: keyboard lock, Owner link, dialog close, retry and layout`);
  }

  let releaseSetting;
  const settingGate = new Promise(resolve => { releaseSetting = resolve; });
  const loading = await browser.newPage({ viewport: { width: 375, height: 900 } });
  await loading.addInitScript(() => localStorage.setItem("pos-special-pricing-enabled", "true"));
  await loading.route("http://localhost:3021/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><script>window.process={env:{}};</script><div id="root"></div></body></html>' });
    if (url.pathname === "/api/settings/special-pricing") {
      await settingGate;
      return route.fulfill({ json: { enabled: false } });
    }
    return route.fulfill({ json: { data: [] } });
  });
  await loading.goto("http://localhost:3021/fixture");
  await loading.addStyleTag({ content: bundle.css });
  await loading.addScriptTag({ content: bundle.script });
  await loading.getByText("Memuat pengaturan Harga Khusus…").waitFor();
  assert.equal(await loading.locator("[inert]").count(), 1, "cached enabled status stays locked until checked");
  releaseSetting();
  await loading.getByText("Fitur Harga Khusus dinonaktifkan.").waitFor();
  await loading.close();
  console.log("PASS loading: cached enabled status remains locked until checked");

  const staff = await browser.newPage({ viewport: { width: 375, height: 900 } });
  let staffEnabled = false;
  await staff.route("http://localhost:3021/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><script>window.process={env:{}};</script><div id="root"></div></body></html>' });
    if (url.pathname === "/api/settings/special-pricing") return route.fulfill({ json: { enabled: staffEnabled } });
    return route.fulfill({ json: { data: [] } });
  });
  await staff.goto("http://localhost:3021/fixture?admin");
  await staff.addStyleTag({ content: bundle.css });
  await staff.addScriptTag({ content: bundle.script });
  await staff.getByText("Hubungi Owner untuk mengaktifkan fitur ini.").waitFor();
  assert.equal(await staff.getByRole("link", { name: "Buka Pengaturan" }).count(), 0);
  assert.equal(await staff.getByRole("button", { name: "Tambah aturan" }).count(), 0);
  staffEnabled = true;
  await staff.evaluate(() => window.pricingQueryClient.invalidateQueries({ queryKey: ["settings", "special-pricing"] }));
  await staff.getByText("Pengelolaan Harga Khusus hanya tersedia untuk Owner.").waitFor();
  assert.equal(await staff.getByRole("button", { name: "Tambah aturan" }).count(), 0);
  await staff.close();
  console.log("PASS staff: notice is visible, rule management stays Owner-only when disabled and enabled");
} finally {
  await browser.close();
}
