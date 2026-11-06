import { expect, test } from "@playwright/test";
import { categories, products } from "./fixtures/mock-data";
import { CHANGELOG } from "../features/changelog/data/changelog";
import { changeKey, seenStorageKey } from "../features/changelog/helpers/changelog";

test("reopens the actual POS, opens a shift, and queues a sale after the connection is lost", async ({ page, context }) => {
  test.setTimeout(420_000);
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
    if (simulateOffline) return route.abort("internetdisconnected");
    const path = new URL(route.request().url()).pathname;
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
  await expect(page.getByLabel("Cari produk, SKU, atau barcode")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(async () => {
    const response = await fetch("/api/offline-sync/catalog");
    const snapshot = await response.json();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("pos-offline-pwa");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("catalogSnapshots", "readwrite");
        tx.objectStore("catalogSnapshots").put({ ...snapshot, id: `${snapshot.cashierId}:${snapshot.storeId}` });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  });
  await page.evaluate(`(async () => {
    const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
    await prepareOfflineAccess({ cashierId: 'e2e-user', storeId: 'store-main', pin: '123456' });
  })()`);

  simulateOffline = true;
  await context.setOffline(true);
  await page.goto("/pos");
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
  await expect(payment).toBeVisible();
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
});
