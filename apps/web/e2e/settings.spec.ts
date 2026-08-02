import { test, expect } from "./fixtures/app";

test("settings can save store information and show WhatsApp status", async ({ appPage: page }) => {
  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Pengaturan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Informasi Toko" })).toBeVisible();

  await page.getByLabel("Nama Toko").fill("Toko E2E Updated");
  await page.getByRole("button", { name: /Simpan Perubahan/ }).click();
  await expect(page.getByRole("button", { name: /Tersimpan/ })).toBeVisible();

  await page.getByRole("button", { name: "WhatsApp" }).click();
  await expect(page.getByRole("heading", { name: "Integrasi WhatsApp" })).toBeVisible();
  await expect(page.getByText("Terhubung")).toBeVisible();
});

test("settings can request a WhatsApp pairing code", async ({ appPage: page }) => {
  let pairCodeBody: Record<string, unknown> | null = null;

  await page.route("**/api/settings/whatsapp/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "DISCONNECTED" }),
    });
  });
  await page.route("**/api/settings/whatsapp/pair-code", async (route) => {
    pairCodeBody = JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: "123-456",
        phoneNumber: "628123456789",
      }),
    });
  });

  await page.goto("/settings");
  await page.getByRole("button", { name: "WhatsApp" }).click();
  await page.getByRole("button", { name: "Pair Code" }).click();

  await page.getByLabel("Nomor telepon").fill("628123456789");
  await expect(page.getByLabel("Method")).toHaveCount(0);
  await page.getByRole("button", { name: "Minta Code" }).click();

  await expect(page.getByText("123-456")).toBeVisible();
  expect(pairCodeBody).toEqual({ phoneNumber: "628123456789" });
});

test("owner can pause and resume Shift Kasir from settings", async ({ appPage: page }) => {
  let patchBody: Record<string, unknown> | null = null;

  await page.route("**/api/settings/shift", async (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: false }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: true }),
    });
  });

  await page.goto("/settings");
  await page.getByRole("button", { name: "Shift Kasir" }).click();
  await expect(page.getByRole("heading", { name: "Gunakan Shift Kasir" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Gunakan Shift Kasir" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("switch", { name: "Gunakan Shift Kasir" }).click();
  await expect(page.getByText("Konfirmasi Matikan Shift")).toBeVisible();
  await page.getByRole("button", { name: "Lanjutkan" }).click();

  await expect(page.getByRole("switch", { name: "Gunakan Shift Kasir" })).toHaveAttribute("aria-pressed", "false");
  expect(patchBody).toEqual({ enabled: false });
});

test("owner can preview and confirm a selective database reset without a real wipe", async ({ appPage: page }) => {
  let executeBody: Record<string, unknown> | null = null;

  await page.route("**/api/settings/database-reset/preview", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}") as { domains?: string[] };
    const blocked = !(body.domains || []).includes("salesFinance");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        storeId: "store-main",
        domains: body.domains || [],
        operations: [
          { model: "Product", domain: "productCatalog", mode: "selected", reason: "catalog", count: 2, where: {} },
          { model: "ProductSupplier", domain: "productCatalog", mode: "cascade", reason: "Link supplier ikut terhapus", count: 1, where: {} },
        ],
        cascades: [{ model: "ProductSupplier", count: 1, reason: "Link supplier ikut terhapus", sourceDomain: "productCatalog" }],
        requiredDependencies: blocked ? [{ domain: "salesFinance", reason: "Transaksi mereferensikan produk", blocking: true }] : [],
        preserved: [{ model: "Category", reason: "Kategori global dipertahankan" }],
        canExecute: !blocked,
      }),
    });
  });
  await page.route("**/api/settings/database-reset/execute", async (route) => {
    executeBody = JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        deleted: [{ model: "Product", count: 2 }, { model: "Transaction", count: 1 }],
        executedAt: "2026-08-02T00:00:00.000Z",
      }),
    });
  });

  await page.goto("/settings");
  await page.getByRole("button", { name: "Reset Database" }).click();
  await expect(page.locator("h2").filter({ hasText: "Reset Database" })).toBeVisible();

  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Lihat Dampak Reset" }).click();
  await expect(page.getByText("Cascade", { exact: true })).toBeVisible();
  await expect(page.getByText("Wajib dipilih")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset Data Terpilih" })).toBeDisabled();

  await page.getByText("Penjualan & Keuangan", { exact: true }).click();
  await page.getByRole("button", { name: "Lihat Dampak Reset" }).click();
  await page.getByLabel("Ketik RESET DATABASE").fill("RESET DATABASE");
  await page.getByRole("button", { name: "Reset Data Terpilih" }).click();

  await expect(page.getByText("Reset berhasil")).toBeVisible();
  expect(executeBody).toEqual({
    domains: ["productCatalog", "salesFinance"],
    confirmation: "RESET DATABASE",
  });
});

test("non-owner does not see the database reset tab", async ({ appPage: page }) => {
  await page.context().addCookies([
    { name: "x-pos-role", value: "ADMIN", domain: "localhost", path: "/" },
  ]);

  await page.goto("/settings");

  await expect(page.getByRole("button", { name: "Reset Database" })).toHaveCount(0);
});
