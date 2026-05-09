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
