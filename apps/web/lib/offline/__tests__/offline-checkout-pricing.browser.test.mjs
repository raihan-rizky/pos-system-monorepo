import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { once } from "node:events";

const require = createRequire(import.meta.url);
const requireFromVitest = createRequire(require.resolve("vitest/package.json"));
const { build } = requireFromVitest("esbuild");
const { chromium } = require("@playwright/test");

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(), sourcefile: "offline-checkout-fixture.ts", loader: "ts",
    contents: `
      import { offlineDb } from './lib/offline/offline-db';
      import { getOfflineCheckoutCatalog } from './lib/offline/offline-pricing';
      import { refreshCartCatalogPrices } from './features/pos-checkout/helpers/cart-catalog-pricing';
      import { priceCartItemsForCheckout } from './features/pos-checkout/helpers/checkout-pricing';
      window.saveCatalog = snapshot => offlineDb.catalogSnapshots.put(snapshot);
      window.priceCart = async (identity, item) => {
        const snapshot = await getOfflineCheckoutCatalog(identity);
        const items = refreshCartCatalogPrices([item], snapshot.products);
        return priceCartItemsForCheckout({ items, customerType: 'UMUM', pricingRules: snapshot.pricing.rules,
          specialPricingEnabled: snapshot.pricing.specialPricingEnabled, manualPrices: {}, role: 'CASHIER',
          roundingSettings: snapshot.pricing.rounding })[0];
      };
    `,
  },
  alias: { "@": process.cwd() }, bundle: true, write: false, platform: "browser", format: "iife",
});
const script = bundle.outputFiles[0].text.replaceAll("</script", "<\\/script");
const html = `<!doctype html><title>Offline pricing fixture</title><script>${script}</script>`;
const worker = `self.addEventListener('install', e => e.waitUntil(caches.open('fixture').then(c => c.add('/pos')).then(() => self.skipWaiting())));
  self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
  self.addEventListener('fetch', e => e.respondWith(caches.match('/pos')));`;
const server = createServer((req, res) => {
  if (req.url === "/sw.js") { res.writeHead(200, { "Content-Type": "text/javascript" }).end(worker); return; }
  res.writeHead(200, { "Content-Type": "text/html" }).end(html);
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
try {
  const page = await context.newPage();
  await page.goto(`${origin}/pos`);
  await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
  await page.reload();
  const identity = { cashierId: "cashier-1", storeId: "store-1" };
  const snapshot = {
    id: "cashier-1:store-1", ...identity, generatedAt: new Date().toISOString(), categories: [],
    products: [{ id: "pcs", name: "Pulpen", category: { id: "bot", name: "BOT" }, variants: [
      { id: "pcs", unit: "pcs", price: 1200, costPrice: 500, catalogSubcategoryId: "bot-sub", catalogSubcategory: { legacyCategoryId: "bot" } },
      { id: "pak", unit: "pak", price: 10000, costPrice: 5000, catalogSubcategoryId: "print", catalogSubcategory: { legacyCategoryId: null } },
    ] }],
    pricing: { specialPricingEnabled: true, rounding: { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: [] }, rules: [
      { id: "legacy", storeId: "store-1", categoryId: "bot", customerType: "UMUM", mode: "PERCENT_DISCOUNT", value: 10, isActive: true, category: { id: "bot", name: "BOT" } },
      { id: "print-rule", scope: "SUBCATEGORY", storeId: "store-1", categoryId: "print", customerType: "UMUM", mode: "PERCENT_DISCOUNT", value: 20, isActive: true, category: { id: "print", name: "PERCETAKAN / PRINT" } },
    ] },
  };
  await page.evaluate(value => window.saveCatalog(value), snapshot);
  await page.evaluate(() => localStorage.setItem("pos-price-rounding-settings", JSON.stringify({ enabled: false, increment: 500, threshold: 50 })));
  await context.setOffline(true);
  await page.reload();
  const cartItem = { lineType: "PRODUCT", productId: "pak", cartLineId: "pak", categoryId: "old", categoryName: "Lama", price: 1, catalogPrice: 1, quantity: 1, unit: "pak" };
  const priced = await page.evaluate(({ identity, cartItem }) => window.priceCart(identity, cartItem), { identity, cartItem });
  assert.equal(priced.price, 8000);
  assert.equal(priced.catalogSubcategoryId, "print");
  assert.equal(priced.appliedPricing.ruleId, "print-rule");
  const legacy = await page.evaluate(({ identity, cartItem }) => window.priceCart(identity, { ...cartItem, productId: 'pcs' }), { identity, cartItem });
  assert.equal(legacy.price, 1500);
  assert.equal(legacy.appliedPricing.ruleId, "legacy");
  const denied = await page.evaluate(async cartItem => {
    try { await window.priceCart({ cashierId: 'other', storeId: 'store-1' }, cartItem); return false; } catch { return true; }
  }, cartItem);
  assert.equal(denied, true);
  console.log("Offline reload: rules, unit classifications, and cashier isolation passed");
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
