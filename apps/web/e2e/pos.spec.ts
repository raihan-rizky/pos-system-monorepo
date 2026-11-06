import { test, expect } from "./fixtures/app";

test("cashier can add a product and open checkout", async ({ appPage: page }) => {
  await page.goto("/pos");

  await expect(page.getByText("Kertas HVS A4").first()).toBeVisible();
  await page.getByText("Kertas HVS A4").first().click();

  await expect(page.getByRole("heading", { name: "Keranjang" })).toBeVisible();
  await expect(page.getByText("Keranjang").first()).toBeVisible();
  await page.getByRole("button", { name: /Bayar/ }).click();

  await expect(page.getByText(/Pembayaran|Payment|Konfirmasi/i).first()).toBeVisible();
});

test("shift disabled allows checkout without an active shift", async ({ appPage: page }) => {
  await page.route("**/api/settings/shift", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: false }),
    });
  });
  await page.route("**/api/shifts?active=true", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: null }),
    });
  });

  await page.goto("/pos");
  await expect(page.getByText("Kertas HVS A4").first()).toBeVisible();
  await expect(page.getByText("Belum Ada Shift Aktif")).toBeHidden();
  await page.getByText("Kertas HVS A4").first().click();
  await page.getByRole("button", { name: /Bayar/ }).click();

  await expect(page.getByText(/Pembayaran|Payment|Konfirmasi/i).first()).toBeVisible();
});

test("offline sync shows the current connection status", async ({ appPage: page }) => {
  await page.goto("/pos/offline");
  await expect(page.getByText("Status: Online", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 });

  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
    window.dispatchEvent(new Event("offline"));
  });
  await expect(page.getByText("Status: Offline", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { get: () => true, configurable: true });
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.getByText("Status: Online", { exact: true })).toBeVisible();
});
