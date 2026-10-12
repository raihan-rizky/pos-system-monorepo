import { test, expect, mockApis } from "./fixtures/app";

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
