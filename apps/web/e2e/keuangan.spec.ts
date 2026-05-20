import { test, expect } from "./fixtures/app";
import { authenticate, mockApis } from "./fixtures/app";

test("keuangan dashboard shows net cash flow, pemasukan, and pengeluaran together", async ({
  appPage: page,
}) => {
  await page.goto("/keuangan?month=2026-05");

  await expect(page.getByRole("heading", { name: "Keuangan" })).toBeVisible();
  await expect(page.getByText("Net Cash Flow", { exact: false })).toBeVisible();
  // Net = 45_000_000 − 850_000
  await expect(page.getByText("Rp 44.150.000")).toBeVisible();

  // Pemasukan column
  await expect(page.getByText("Rp 45.000.000")).toBeVisible();
  await expect(page.getByText("312 transaksi")).toBeVisible();

  // Pengeluaran column
  await expect(page.getByText("Rp 850.000")).toBeVisible();
  await expect(page.getByText("Pak Budi")).toBeVisible();
  await expect(page.getByText("Sari")).toBeVisible();

  await page.getByRole("button", { name: /Tambah Pengeluaran/ }).click();
  await expect(page.getByRole("heading", { name: "Tambah Pengeluaran" })).toBeVisible();
  await page.getByRole("button", { name: "Batal" }).click();
});

test("sales role cannot access keuangan and is redirected", async ({ page }) => {
  await authenticate(page, "SALES");
  await mockApis(page);
  await page.goto("/keuangan");
  await expect(page).toHaveURL(/\/pos/);
});
