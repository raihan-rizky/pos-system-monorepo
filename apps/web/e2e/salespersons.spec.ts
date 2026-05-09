import { test, expect } from "./fixtures/app";

test("salesperson management can filter and open create/edit flows", async ({ appPage: page }) => {
  await page.goto("/salespersons");

  await expect(page.getByRole("heading", { name: "Tim Sales" })).toBeVisible();
  await expect(page.getByText("Rina Sales").first()).toBeVisible();

  await page.getByPlaceholder("Cari nama salesperson...").fill("Rina");
  await expect(page.getByText("Rina Sales").first()).toBeVisible();

  await page.getByRole("button", { name: "Tambah Sales" }).click();
  await expect(page.getByRole("heading", { name: "Tambah Salesperson" })).toBeVisible();
  await page.getByRole("button", { name: "Batal" }).click();

  await page.locator("#edit-sp-sp-1").click();
  await expect(page.getByRole("heading", { name: "Edit Salesperson" })).toBeVisible();
});
