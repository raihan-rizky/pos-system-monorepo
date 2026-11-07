import { authenticate, expect, mockApis, test } from "./fixtures/app";

test("fixture meneruskan pemeriksaan hak akses ke handler berikutnya", async ({ page }) => {
  const access = { user: { id: "e2e-sales", role: "SALES" }, authorizationFingerprint: "contoh" };
  await page.route("**/api/auth/permissions", route => route.fulfill({ status: 200, json: access }));
  await mockApis(page);

  const response = await page.goto("/api/auth/permissions");

  expect(response?.status()).toBe(200);
  expect(await response?.json()).toEqual(access);
});

test("fixture menyediakan kotak notifikasi kosong", async ({ page }) => {
  await mockApis(page);

  const response = await page.goto("/api/notifications?limit=30");

  expect(response?.status()).toBe(200);
  expect(await response?.json()).toEqual({ data: { notifications: [], unreadCount: 0 } });
});

test("fixture pengguna kembali menyimpan status ajakan notifikasi", async ({ page }) => {
  await authenticate(page);
  await mockApis(page);
  await page.goto("/api/settings/price-rounding");

  expect(await page.evaluate(() => localStorage.getItem("pos_push_prompt_seen_v1"))).toBe("1");
});
