import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { categories, products } from "./fixtures/mock-data";
import { CHANGELOG } from "../features/changelog/data/changelog";
import { changeKey, seenStorageKey } from "../features/changelog/helpers/changelog";

async function exerciseOfflineCheckout({ page, context }: { page: Page; context: BrowserContext }, outage: "disconnected" | "server-unavailable") {
  test.setTimeout(180_000);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.stack || error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.url().includes("/_next/static/") && response.status() >= 400) browserErrors.push(`asset ${response.status()}: ${response.url()}`);
  });

  // The app intentionally unregisters workers in development. Keep the worker
  // registered only in this isolated Playwright context so its production policy can be exercised.
  await context.addInitScript(() => {
    if (navigator.serviceWorker) navigator.serviceWorker.getRegistrations = async () => [];
    if (window.caches) window.caches.keys = async () => [];
    localStorage.setItem("pos-price-rounding-settings", JSON.stringify({ enabled: false, increment: 500, threshold: 50 }));
    localStorage.setItem("pos-special-pricing-enabled", "false");
    localStorage.setItem("pos_push_prompt_seen_v1", "1");
  });
  await context.addInitScript(({ storageKey, seen }) => {
    localStorage.setItem(storageKey, JSON.stringify(seen));
  }, { storageKey: seenStorageKey("e2e-user"), seen: CHANGELOG.map(changeKey) });
  await context.addCookies([
    { name: "x-pos-role", value: "OWNER", domain: "localhost", path: "/" },
    { name: "x-pos-user-id", value: "e2e-user", domain: "localhost", path: "/" },
    { name: "x-pos-store-id", value: "store-main", domain: "localhost", path: "/" },
  ]);
  let simulateOffline = false;
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (simulateOffline) return route.abort("internetdisconnected");
    if (path === "/api/auth/permissions") return route.fallback();
    const body = path === "/api/auth/me"
      ? { user: { id: "e2e-user", storeId: "store-main", role: "OWNER" } }
      : path === "/api/products"
        ? { data: products, pagination: { total: products.length, page: 1, limit: 24, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }
        : path === "/api/offline-sync/catalog"
          ? { cashierId: "e2e-user", storeId: "store-main", generatedAt: new Date().toISOString(), products, categories }
        : path === "/api/printing-receipts"
          ? { data: [], pagination: { total: 0, page: 1, totalPages: 1, hasNextPage: false } }
        : path === "/api/settings/price-rounding" ? { enabled: false, increment: 500, threshold: 50 }
          : path === "/api/settings/special-pricing" ? { enabled: false }
          : path === "/api/settings/shift" ? { enabled: true }
          : path === "/api/shifts" ? { data: null }
            : path === "/api/categories" ? { data: categories }
              : path === "/api/brands" || path === "/api/customer-category-pricing-rules" ? { data: [] } : {};
    await route.fulfill({ json: body });
  });
  await page.goto("/pos", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Cari produk, SKU, atau barcode")).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.goto("/pos/offline");
  const preparation = page.getByRole("region", { name: "Buka kembali POS saat offline" });
  await preparation.getByLabel("PIN offline", { exact: true }).fill("123456");
  await preparation.getByLabel("Ulangi PIN").fill("123456");
  await preparation.getByRole("button", { name: "Siapkan POS offline" }).click();
  await expect(preparation.getByRole("status")).toHaveText("POS offline disiapkan untuk akun ini di perangkat ini.", { timeout: 120_000 });

  if (outage === "server-unavailable") await context.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  });
  simulateOffline = true;
  await context.setOffline(true);
  await page.goto("/pos");
  await expect(page.getByLabel("PIN offline")).toBeVisible({ timeout: 30_000 });
  if (outage === "server-unavailable") expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await page.getByLabel("PIN offline").fill("123456");
  await page.getByRole("button", { name: "Buka POS offline" }).click();
  const openShift = page.getByRole("dialog", { name: "Buka Shift Kasir" });
  await expect(openShift).toBeVisible({ timeout: 30_000 });
  await openShift.getByLabel("Modal Awal Laci").fill("100000");
  await openShift.getByRole("button", { name: "Buka Shift", exact: true }).click();
  await expect(openShift).toBeHidden();
  const search = page.getByLabel("Cari produk, SKU, atau barcode");
  await expect(search).toBeVisible();
  await search.fill("kertas");
  try {
    await expect(page.getByRole("button", { name: "Hapus pencarian" })).toBeVisible({ timeout: 15_000 });
  } catch (error) {
    console.error("Browser errors:", browserErrors.join("\n"));
    throw error;
  }
  await expect(page.getByText("Kertas HVS A4").first()).toBeVisible();
  await page.getByText("Kertas HVS A4").first().click();
  try {
    await page.getByRole("button", { name: "Bayar", exact: true }).click({ timeout: 30_000 });
  } catch (error) {
    console.error("Browser errors:", browserErrors.join("\n"));
    throw error;
  }
  const payment = page.getByRole("dialog", { name: "Pembayaran" });
  try {
    await expect(payment).toBeVisible();
  } catch (error) {
    console.error("Browser errors:", browserErrors.join("\n"));
    throw error;
  }
  await payment.getByLabel("Jumlah Bayar (Rp)").fill("60000");
  await payment.getByRole("button", { name: "Konfirmasi Bayar" }).click();
  await expect(page.getByText(/Transaksi tersimpan di perangkat/)).toBeVisible();
  const queued = await page.evaluate(async () => new Promise<unknown[]>((resolve, reject) => {
    const request = indexedDB.open("pos-offline-pwa");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const result = db.transaction("offlineTransactions", "readonly").objectStore("offlineTransactions").getAll();
      result.onsuccess = () => { db.close(); resolve(result.result); };
      result.onerror = () => { db.close(); reject(result.error); };
    };
  }));
  expect(queued).toEqual(expect.arrayContaining([expect.objectContaining({
    status: "PENDING_SYNC",
    payload: expect.objectContaining({ originCashierId: "e2e-user", originStoreId: "store-main", amountPaid: 60000 }),
  })]));
}

test("reopens the actual POS, opens a shift, and queues a sale after the connection is lost", async ({ page, context }) => {
  await exerciseOfflineCheckout({ page, context }, "disconnected");
});

test("opens a shift and queues a sale when the server is unavailable but Wi-Fi remains online", async ({ page, context }) => {
  await exerciseOfflineCheckout({ page, context }, "server-unavailable");
});
