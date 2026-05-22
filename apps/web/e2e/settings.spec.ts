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
