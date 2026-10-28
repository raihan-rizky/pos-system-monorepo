import { test, expect, authenticate, mockApis } from "./fixtures/app";
import { seenStorageKey } from "../features/changelog/helpers/changelog";

test("fixture login menyimpan status pembaruan untuk ID pengguna yang dipakai", async ({ page }) => {
  const userId = "e2e-owner";
  await authenticate(page, "OWNER", userId);
  await mockApis(page);
  await page.goto("/api/settings/price-rounding");
  const cookies = await page.context().cookies();
  expect(cookies.find(cookie => cookie.name === "x-pos-user-id")?.value).toBe(userId);
  const seen = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), seenStorageKey(userId));
  expect(seen).toEqual(expect.any(Array));
  expect(seen.length).toBeGreaterThan(0);
});

test("product detail mock preserves the API envelope and requested identity", async ({ page }) => {
  await mockApis(page);
  const response = await page.goto("/api/products/prod-banner");
  expect(await response!.json()).toMatchObject({
    data: { id: "prod-banner", name: "Banner Indoor", price: 25000 },
  });
});

test("shift settings mock persists changes across refetches", async ({ page }) => {
  await mockApis(page);
  await page.goto("/api/settings/shift");
  for (const enabled of [false, true]) {
    const result = await page.evaluate(async (value) => {
      const updated = await fetch("/api/settings/shift", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: value }),
      });
      const refetched = await fetch("/api/settings/shift");
      return { updated: await updated.json(), refetched: await refetched.json() };
    }, enabled);
    expect(result).toEqual({ updated: { enabled }, refetched: { enabled } });
  }
});

test("mock pembulatan menyediakan kebijakan valid dan menyimpan perubahan saat dimuat ulang", async ({ page }) => {
  await mockApis(page);
  const response = await page.goto("/api/settings/price-rounding");
  expect(response!.status()).toBe(200);
  expect(await response!.json()).toEqual({ enabled: true, increment: 500, threshold: 50 });

  for (const settings of [
    { enabled: false, increment: 500, threshold: 50 },
    { enabled: true, increment: 1000, threshold: 100 },
    { enabled: true, increment: 500, threshold: 50 },
  ]) {
    const result = await page.evaluate(async (policy) => {
      const updated = await fetch("/api/settings/price-rounding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      const refetched = await fetch("/api/settings/price-rounding");
      return {
        status: updated.status,
        updated: await updated.json(),
        refetched: await refetched.json(),
      };
    }, settings);
    expect(result).toEqual({ status: 200, updated: settings, refetched: settings });
  }
});
