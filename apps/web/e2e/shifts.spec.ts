import { test, expect } from "./fixtures/app";

test("shift history shows cash drawer records and edit flow", async ({ appPage: page }) => {
  await page.goto("/shift");

  await expect(page.getByRole("heading", { name: "Riwayat Shift Kasir" })).toBeVisible();
  await expect(page.getByText("E2E shift").first()).toBeVisible();
  await expect(page.getByText("OPEN").first()).toBeVisible();

  await page.getByTitle("Ubah Shift").first().click();
  await expect(page.getByText("Ubah Riwayat Shift")).toBeVisible();
});
