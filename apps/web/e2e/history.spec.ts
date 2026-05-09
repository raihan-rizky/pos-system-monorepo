import { test, expect } from "./fixtures/app";

test("history page lists transactions and opens a receipt", async ({ appPage: page }) => {
  await page.goto("/history");

  await expect(page.getByRole("heading", { name: "Riwayat Transaksi" })).toBeVisible();
  await expect(page.getByText("INV-20260509-0001")).toBeVisible();

  await page.getByRole("button", { name: "Lihat Struk" }).first().click();
  await expect(page.getByText("Transaksi Berhasil")).toBeVisible();
  await expect(page.getByRole("heading", { name: "TOKO TELADAN" })).toBeVisible();
});
