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

test("offline status is visible when the browser is offline", async ({ appPage: page, context }) => {
  await page.goto("/pos");
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));

  await expect(page.getByRole("status").filter({ hasText: /Offline mode/i })).toBeVisible();

  await context.setOffline(false);
});
