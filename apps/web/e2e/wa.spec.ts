import { test, expect } from "./fixtures/app";

test("WA live chat lists contacts, opens messages, and sends a reply", async ({ appPage: page }) => {
  await page.goto("/wa");

  await expect(page.getByRole("heading", { name: "WA Live Chat" })).toBeVisible();
  await page.getByText("Budi WA").click();

  await expect(page.getByText("Halo toko").first()).toBeVisible();
  await page.getByPlaceholder("Ketik balasan untuk pelanggan ini...").fill("Siap dibantu");
  await page.getByPlaceholder("Ketik balasan untuk pelanggan ini...").press("Enter");
  await expect(page.getByText("Siap dibantu")).toBeVisible();
});

test("WA live chat shows incoming messages without a page refresh", async ({ appPage: page }) => {
  let includeIncoming = false;

  await page.route("**/api/wa/contacts", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "628123456789@c.us",
            phone: "628123456789",
            name: "Budi WA",
            picture: null,
            role: includeIncoming ? "user" : "assistant",
            content: includeIncoming ? "Pesan baru realtime" : "Halo toko",
            created_at: includeIncoming
              ? "2026-05-09T01:01:00.000Z"
              : "2026-05-09T01:00:00.000Z",
            image_url: null,
          },
        ],
      }),
    });
  });

  await page.route("**/api/wa/messages?**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: "wa-1",
            phone: "628123456789",
            role: "user",
            content: "Halo toko",
            created_at: "2026-05-09T01:00:00.000Z",
            image_url: null,
          },
          ...(includeIncoming
            ? [
                {
                  id: "wa-2",
                  phone: "628123456789",
                  role: "user",
                  content: "Pesan baru realtime",
                  created_at: "2026-05-09T01:01:00.000Z",
                  image_url: null,
                },
              ]
            : []),
        ],
      }),
    });
  });

  await page.goto("/wa");
  await page.getByText("Budi WA").click();
  await expect(page.getByText("Halo toko").first()).toBeVisible();
  await expect(page.getByText("Pesan baru realtime")).toHaveCount(0);

  includeIncoming = true;

  await expect(
    page.locator(".wa-markdown").getByText("Pesan baru realtime"),
  ).toBeVisible({ timeout: 6_000 });
});
