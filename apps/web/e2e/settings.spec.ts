import { test, expect } from "./fixtures/app";

test("settings can save store information and show WhatsApp status", async ({ appPage: page }) => {
  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Store Information" })).toBeVisible();

  await page.getByLabel("Store Name").fill("Toko E2E Updated");
  await page.getByRole("button", { name: /Save Changes/ }).click();
  await expect(page.getByRole("button", { name: /Saved!/ })).toBeVisible();

  await page.getByRole("button", { name: "WhatsApp" }).click();
  await expect(page.getByRole("heading", { name: "WhatsApp Integration" })).toBeVisible();
  await expect(page.getByText("Connected")).toBeVisible();
});
