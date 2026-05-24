import { test, expect } from "./fixtures/app";
import { transaction } from "./fixtures/mock-data";

test("history page lists transactions and opens a receipt", async ({ appPage: page }) => {
  await page.goto("/history");

  await expect(page.getByRole("heading", { name: "Riwayat Transaksi" })).toBeVisible();
  await expect(page.getByText("INV-20260509-0001")).toBeVisible();

  await page.getByRole("button", { name: "Lihat Struk" }).first().click();
  const receiptDialog = page.getByRole("dialog", { name: "Transaksi Berhasil" });
  await expect(receiptDialog).toBeVisible();
  await expect(receiptDialog.getByRole("heading", { name: "Toko E2E" })).toBeVisible();
});

test("history page opens a receipt for draft transactions", async ({ appPage: page }) => {
  const draftTransaction = {
    ...transaction,
    id: "draft-history-1",
    invoiceNumber: null,
    draftNumber: "DRAFT-20260520-0001",
    status: "DRAFT",
    amountPaid: 0,
    change: 0,
    note: null,
  };

  await page.route("**/api/transactions?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [draftTransaction],
        pagination: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }),
    });
  });

  await page.goto("/history");

  const draftRow = page.getByRole("row").filter({
    hasText: "DRAFT-20260520-0001",
  });

  await expect(draftRow.getByRole("button", { name: "Lihat Struk" })).toBeVisible();

  await draftRow.getByRole("button", { name: "Lihat Struk" }).click();

  const draftDialog = page.getByRole("dialog", { name: "Faktur Sementara" });
  await expect(draftDialog).toBeVisible();
  await expect(draftDialog.getByRole("heading", { name: "Faktur Sementara" })).toBeVisible();
  await expect(draftDialog.getByText("BELUM LUNAS")).toBeVisible();
  await expect(draftDialog.getByText(/^Faktur sementara$/)).toBeVisible();
});
