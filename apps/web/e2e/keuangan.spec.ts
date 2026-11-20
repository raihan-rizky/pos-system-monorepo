import { test, expect } from "./fixtures/app";
import { authenticate, mockApis } from "./fixtures/app";

test("keuangan dashboard shows net cash flow, pemasukan, and pengeluaran together", async ({
  appPage: page,
}) => {
  await page.goto("/keuangan?month=2026-05");

  await expect(page.getByRole("heading", { name: "Keuangan" })).toBeVisible();
  await expect(page.getByText(/^Net Cash Flow /)).toBeVisible();
  // Net = 45_000_000 − 850_000
  await expect(page.getByText("Rp 44.150.000", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Pemasukan column
  await expect(page.getByText("Rp 45.000.000", { exact: true })).toBeVisible();
  await expect(page.getByText("312 trx")).toBeVisible();

  // Pengeluaran column
  await expect(page.getByText("Rp 850.000", { exact: true })).toBeVisible();
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

test("koreksi pengeluaran meninjau pembayaran dan pembelian secara terpisah", async ({ appPage: page }) => {
  test.setTimeout(180_000);
  const payments = [{ id: "payment-1", amountCents: 30_000, paidAt: "2026-05-04" }];
  let reference = "BT-1";
  await page.route(/\/api\/finance\/expenses\?/, route => route.fulfill({ json: {
    data: [{
      id: "expense-1", applicantName: "Pemasok Uji", category: "SUPPLIES", description: `Belanja ${reference}`,
      amount: 300, changeAmount: 0, netAmount: 300, occurredAt: "2026-05-04T00:00:00Z",
      createdAt: "2026-05-04T00:00:00Z", transactionId: null, attachmentUrl: null, hasMissingCostSnapshot: false,
      source: { type: "BACKDATED_PURCHASE", id: "purchase-1", number: reference },
      paymentSource: { kind: "BACKDATED_PAYMENT", id: "payment-1" }, recordedBy: { id: "owner", name: "Pemilik" },
    }],
    pagination: { total: 1, page: 1, limit: 50, totalPages: 1 }, incomplete: false,
  } }));
  await page.route(/\/api\/finance\/expense-corrections(?:\/preview|\?|$)/, route => {
    const request = route.request();
    if (request.method() === "GET") {
      return route.fulfill({ json: { data: {
        kind: "backdated", payments, suppliers: [],
        payment: new URL(request.url()).searchParams.has("paymentId") ? payments[0] : undefined,
        editor: { id: "purchase-1", reference, purchaseDate: "2026-05-03", dueDate: "2026-05-30", paymentMethod: "GIRO", amountCents: 100_000 },
      } } });
    }
    const body = request.postDataJSON();
    if (request.url().endsWith("/preview")) {
      return route.fulfill({ json: { data: {
        version: "a".repeat(64),
        blockers: body.operation === "cancel" ? [{ message: "Selesaikan pembayaran yang masih tercatat." }] : [],
        impact: { before: { amountCents: 100_000, paidCents: 30_000, remainingCents: 70_000 },
          after: { amountCents: 110_000, paidCents: 30_000, remainingCents: 80_000 }, stockMovements: [] },
      } } });
    }
    reference = body.draft.changes.reference;
    return route.fulfill({ json: { data: { auditId: "audit-1" } } });
  });
  await page.goto("/keuangan?month=2026-05");
  const menu = page.getByRole("button", { name: "Aksi BT-1" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Ubah pembayaran" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Batalkan pembelian" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await menu.click();
  await page.getByRole("menuitem", { name: "Ubah pembelian" }).click();
  const panel = page.getByRole("dialog", { name: "Ubah pembelian" });
  await panel.getByRole("textbox", { name: "Referensi" }).fill("BT-1 koreksi");
  await panel.getByRole("spinbutton", { name: "Nilai pembelian" }).fill("1100");
  await panel.getByRole("textbox", { name: "Alasan koreksi" }).fill("Perbaiki nilai berdasarkan nota");
  await panel.getByRole("button", { name: "Tinjau perubahan" }).click();
  await expect(panel.getByRole("columnheader", { name: "Sesudah" })).toBeVisible();
  await panel.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Belanja BT-1 koreksi", { exact: false })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Aksi BT-1 koreksi" }).click();
  await page.getByRole("menuitem", { name: "Batalkan pembayaran" }).click();
  const mobilePanel = page.getByRole("dialog", { name: "Batalkan pembayaran" });
  await expect(mobilePanel.getByText("Pembayaran 1", { exact: false })).toBeVisible();
  expect((await mobilePanel.boundingBox())?.width).toBe(390);
  await mobilePanel.getByRole("textbox", { name: "Alasan pembatalan" }).fill("Menunggu pengembalian dana");
  await mobilePanel.getByRole("button", { name: "Tinjau pembatalan" }).click();
  await expect(mobilePanel.getByText("Selesaikan pembayaran yang masih tercatat.")).toBeVisible();
  await expect(mobilePanel.getByRole("button", { name: "Batalkan pembayaran" })).toBeDisabled();
});
