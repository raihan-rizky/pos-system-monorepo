import { test, expect } from "./fixtures/app";
import { transaction } from "./fixtures/mock-data";

test("history page lists transactions and opens a receipt", async ({ appPage: page }) => {
  await page.goto("/history");

  await expect(page.getByRole("heading", { name: "Riwayat Transaksi" })).toBeVisible();
  const transactionEntry = page.getByRole("button", {
    name: /INV-20260509-0001/,
  });
  await expect(transactionEntry).toBeVisible();

  await transactionEntry.getByRole("button", { name: "Lihat Struk" }).click();
  const receiptDialog = page.getByRole("dialog", { name: "Transaksi Berhasil" });
  await expect(receiptDialog).toBeVisible();
  await expect(receiptDialog.getByText("Toko E2E", { exact: true })).toBeVisible();
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
  await page.route("**/api/transactions/draft-history-1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(draftTransaction),
    });
  });

  await page.goto("/history");

  const draftEntry = page.getByRole("button", {
    name: /DRAFT-20260520-0001/,
  });

  await expect(draftEntry.getByRole("button", { name: "Lihat Struk" })).toBeVisible();

  await draftEntry.getByRole("button", { name: "Lihat Struk" }).click();

  const draftDialog = page.getByRole("dialog", {
    name: "Cetak Nota Penawaran",
  });
  await expect(draftDialog).toBeVisible();
  await expect(
    draftDialog.getByText("No. DRAFT-20260520-0001"),
  ).toBeVisible();
  await expect(
    draftDialog.getByRole("button", { name: "Cetak Nota Penawaran" }),
  ).toBeVisible();
});

test("history row actions escape the scrollable table clipping boundary", async ({ appPage: page }) => {
  await page.setViewportSize({ width: 1280, height: 529 });
  await page.goto("/history");

  const transactionEntry = page.getByRole("button", { name: /INV-20260509-0001/ });
  await expect(transactionEntry).toBeVisible();
  await transactionEntry.getByRole("button", { name: "Pilihan aksi" }).click();

  const voidAction = page.getByRole("button", { name: "Void", exact: true });
  await expect(voidAction).toBeVisible();
  const receivesPointerEvents = await voidAction.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const hitTarget = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hitTarget === button || Boolean(hitTarget && button.contains(hitTarget));
  });

  expect(receivesPointerEvents).toBe(true);
  await voidAction.click();
  await expect(page.getByRole("heading", { name: "Batalkan Transaksi?" })).toBeVisible();
});
