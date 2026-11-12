import { expect, test, type BrowserContext, type Page } from "@playwright/test";

test("three independent sessions can use the same account and sign out separately", async ({ browser, baseURL }) => {
  test.skip(test.info().project.name !== "multi-device-auth", "Run with playwright.multi-device.config.ts");
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const scopes: string[] = [];

  const permissions = async (context: BrowserContext) => {
    const response = await context.request.get("/api/auth/permissions", { maxRedirects: 0 });
    try { return response.status(); } finally { await response.dispose(); }
  };

  try {
    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      const page = await context.newPage();
      pages.push(page);
      page.on("request", request => {
        const url = new URL(request.url());
        if (request.method() === "POST" && url.pathname.endsWith("/auth/v1/logout")) {
          scopes.push(url.searchParams.get("scope") ?? "(default)");
        }
      });
      await page.goto("/login");
      await page.locator("#login-username").fill(process.env.POS_MULTI_DEVICE_USERNAME!);
      await page.locator("#login-password").fill(process.env.POS_MULTI_DEVICE_PASSWORD!);
      await page.locator("#login-submit").click();
      await expect(page).toHaveURL(/\/pos\/?$/);
      await expect.poll(() => permissions(context)).toBe(200);
    }

    await expect.poll(async () => Promise.all(contexts.map(permissions))).toEqual([200, 200, 200]);
    await pages[0].locator("#sidebar-logout").click();
    await expect(pages[0]).toHaveURL(/\/login\/?$/);
    await expect.poll(async () => Promise.all(contexts.map(permissions))).toEqual([401, 200, 200]);
    expect(scopes).toContain("local");
    expect(scopes.every(scope => scope === "local")).toBe(true);
  } finally {
    for (const page of pages) {
      if (await page.locator("#sidebar-logout").isVisible().catch(() => false)) {
        await page.locator("#sidebar-logout").click({ timeout: 3_000 }).catch(() => undefined);
        await page.waitForURL(/\/login\/?$/, { timeout: 5_000 }).catch(() => undefined);
      }
    }
    await Promise.all(contexts.map(context => context.close()));
  }
});
