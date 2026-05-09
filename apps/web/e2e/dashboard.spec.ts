import { test, expect } from "./fixtures/app";

test("dashboard shows business KPIs and drill-down widgets", async ({ appPage: page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Dashboard Intelligence" })).toBeVisible();
  await expect(page.getByText("Revenue Today")).toBeVisible();
  await expect(page.getByText("Outstanding DP")).toBeVisible();
  await expect(page.getByText("Rina Sales")).toBeVisible();
  await expect(page.getByText("Budi").first()).toBeVisible();
  await expect(page.getByText("Recent Transactions")).toBeVisible();
});
