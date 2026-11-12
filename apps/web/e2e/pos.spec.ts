import { test, expect } from "./fixtures/app";

test("cashier can add a product and open checkout", async ({ appPage: page }) => {
  await page.goto("/pos");

  await expect(page.getByText("Kertas HVS A4").first()).toBeVisible();
  await page.getByText("Kertas HVS A4").first().click();

  await expect(page.getByRole("heading", { name: "Keranjang" })).toBeVisible();
  await expect(page.getByText("Keranjang").first()).toBeVisible();
  await page.getByRole("button", { name: /Bayar/ }).click();

  await expect(page.getByText(/Pembayaran|Payment|Konfirmasi/i).first()).toBeVisible();
});

test("shift disabled allows checkout without an active shift", async ({ appPage: page }) => {
  await page.route("**/api/settings/shift", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: false }),
    });
  });
  await page.route("**/api/shifts?active=true", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: null }),
    });
  });

  await page.goto("/pos");
  await expect(page.getByText("Kertas HVS A4").first()).toBeVisible();
  await expect(page.getByText("Belum Ada Shift Aktif")).toBeHidden();
  await page.getByText("Kertas HVS A4").first().click();
  await page.getByRole("button", { name: /Bayar/ }).click();

  await expect(page.getByText(/Pembayaran|Payment|Konfirmasi/i).first()).toBeVisible();
});

test("a verified POS session preserves checkout offline and waits for authorization before saving", async ({ appPage: page, context }) => {
  const transactionRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/transactions") {
      transactionRequests.push(request.url());
    }
  });
  await page.goto("/pos");
  await expect(page.getByText("Kertas HVS A4").first()).toBeVisible();
  await page.getByText("Kertas HVS A4").first().click();
  await page.getByRole("button", { name: /Bayar/ }).click();
  const note = page.getByRole("textbox", { name: "Catatan (opsional)" });
  const amount = page.getByLabel("Jumlah Bayar (Rp)", { exact: true });
  const confirm = page.getByRole("button", { name: "Konfirmasi Bayar", exact: true });
  await note.fill("Pesanan tetap tersimpan selama koneksi pulih");
  await amount.fill("100000");
  await expect(confirm).toBeEnabled();

  await context.setOffline(true);
  const recovery = page.getByRole("status").filter({ hasText: "Koneksi sedang dipulihkan" });
  await expect(recovery).toBeVisible();
  await expect(note).toHaveValue("Pesanan tetap tersimpan selama koneksi pulih");
  await expect(amount).toHaveValue("100000");
  await confirm.click();
  await expect(page.getByText("Tunggu hingga koneksi pulih, lalu coba lagi.", { exact: true })).toBeVisible();
  await expect(note).toHaveValue("Pesanan tetap tersimpan selama koneksi pulih");
  await expect(confirm).toBeVisible();
  expect(transactionRequests).toEqual([]);

  await context.setOffline(false);
  await expect(recovery).toBeHidden({ timeout: 30_000 });
  await expect(note).toHaveValue("Pesanan tetap tersimpan selama koneksi pulih");
  await expect(amount).toHaveValue("100000");
  const submitted = page.waitForRequest((request) =>
    request.method() === "POST" && new URL(request.url()).pathname === "/api/transactions",
  );
  await confirm.click();
  await submitted;
  await expect(page.getByRole("heading", { name: "Pembayaran", exact: true })).toBeHidden();
  expect(transactionRequests).toHaveLength(1);
  await page.goto("/pos/offline");
  await expect(page.getByText("Status: Online")).toBeVisible();
});
