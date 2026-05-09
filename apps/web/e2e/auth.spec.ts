import { test, expect } from "@playwright/test";

test("login shows a clear error for invalid credentials", async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/auth/v1/")) {
        return new Response(
          JSON.stringify({ message: "Invalid login credentials" }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
      return originalFetch(input, init);
    };
  });

  await page.route("**/auth/v1/**", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error_description: "Invalid login credentials", message: "Invalid login credentials" }),
    });
  });

  await page.goto("/login");
  await page.locator("#login-username").fill("wrong-user");
  await page.locator("#login-password").fill("wrong-password");
  await page.locator("#login-submit").click();

  await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
});
