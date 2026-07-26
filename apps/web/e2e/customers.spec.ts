import { test, expect } from "./fixtures/app";

test("customers page supports search, create modal, and debt payment", async ({ appPage: page }) => {
  await page.goto("/customers");

  await expect(page.getByRole("heading", { name: /Kelola pelanggan/ })).toBeVisible();
  await expect(page.getByText("Budi").first()).toBeVisible();

  await page.getByPlaceholder(/Cari nama/).fill("Budi");
  await expect(page.getByText("CV Budi")).toBeVisible();

  await page.getByRole("button", { name: /Tambah Pelanggan/ }).click();
  await expect(
    page.getByRole("heading", { name: "Bangun profil pelanggan baru" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Batal" }).click();

  await page.getByRole("button", { name: "Bayar Piutang", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Budi" })).toBeVisible();
  await expect(page.getByText("JOB-20260509-0001")).toBeVisible();
  await page.getByRole("button", { name: "LUNAS" }).click();
  await expect(page.getByRole("button", { name: "Lunaskan" })).toBeVisible();
});
