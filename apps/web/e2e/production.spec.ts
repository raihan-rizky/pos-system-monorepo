import { test, expect } from "./fixtures/app";

test("production board shows job cards and can move work forward", async ({ appPage: page }) => {
  await page.goto("/production");

  await expect(page.getByRole("heading", { name: "Papan Produksi" })).toBeVisible();
  await expect(page.getByText("JOB-20260509-0001")).toBeVisible();

  await page.getByRole("button", { name: "Siap" }).click();
  await expect(page.locator("span").filter({ hasText: "Siap" }).first()).toBeVisible();
});
