import { test, expect } from "./fixtures/app";

test("products page supports search, filters, and add modal", async ({ appPage: page }) => {
  await page.goto("/products");

  await expect(page.getByRole("heading", { name: "Pusat Produk" })).toBeVisible();
  await expect(page.getByText("Kertas HVS A4").first()).toBeVisible();

  await page.getByPlaceholder("Cari nama, SKU, atau barcode").fill("banner");
  await expect(page.getByText("Banner Indoor").first()).toBeVisible();

  await page.getByRole("button", { name: /Filter/ }).click();
  await page.getByRole("button", { name: "Stok Menipis" }).click();
  await expect(page.getByText("STOK MENIPIS").first()).toBeVisible();

  await page.getByRole("button", { name: /Tambah Produk/ }).click();
  await expect(page.getByRole("heading", { name: "Tambah Produk" })).toBeVisible();
});
