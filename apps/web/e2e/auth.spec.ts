import { test, expect } from "@playwright/test";

test("successful first login lands on POS with sidebar menus visible", async ({ page }) => {
  await page.context().clearCookies();

  await page.route("**/api/auth/clear-session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route("**/api/products**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 24,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }),
    });
  });

  await page.route("**/api/categories**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route("**/api/shifts?active=true**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: null }),
    });
  });

  await page.route("**/auth/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/logout")) {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "e2e-access-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "e2e-refresh-token",
        user: {
          id: "e2e-user",
          aud: "authenticated",
          role: "authenticated",
          email: "admin@pos.local",
          email_confirmed_at: new Date().toISOString(),
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }),
    });
  });

  await page.goto("/login");
  await page.locator("#login-username").fill("admin");
  await page.locator("#login-password").fill("password");
  await page.locator("#login-submit").click();

  await expect(page).toHaveURL(/\/pos$/);
  await expect(page.getByRole("link", { name: "Kasir", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
});

test("login shows a clear error for invalid credentials", async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url.includes("/api/auth/clear-session")) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (url.includes("/auth/v1/logout")) {
        return new Response(null, { status: 204 });
      }

      if (url.includes("/auth/v1/token")) {
        return new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Invalid login credentials",
            message: "Invalid login credentials",
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }

      return originalFetch(input, init);
    };
  });

  await page.route("**/api/auth/clear-session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route("**/auth/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/logout")) {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "invalid_grant",
        error_description: "Invalid login credentials",
        message: "Invalid login credentials",
      }),
    });
  });

  await page.goto("/login");
  await page.locator("#login-username").fill("wrong-user");
  await page.locator("#login-password").fill("wrong-password");
  await page.locator("#login-submit").click();

  await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
});
