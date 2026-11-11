import { test, expect } from "./fixtures/app";

test("dashboard shows business KPIs and drill-down widgets", async ({
  appPage: page,
}) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Pemasukan Hari Ini", { exact: true })).toBeVisible();
  await expect(page.getByText("Outstanding DP")).toBeVisible();
  await expect(page.getByText("Rina Sales")).toBeVisible();
  await expect(page.getByText("Budi").first()).toBeVisible();
  await expect(page.getByText("Transaksi Terbaru")).toBeVisible();
});
