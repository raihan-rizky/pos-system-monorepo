import { test, expect } from "./fixtures/app";
import { authenticate, mockApis } from "./fixtures/app";

test("financial report page renders summary metrics from API", async ({
  appPage: page,
}) => {
  await page.goto("/financial-report");

  await expect(
    page.getByRole("heading", { name: "Laporan Keuangan" }),
  ).toBeVisible();
  await expect(page.getByText("Rp 4.500.000")).toBeVisible(); // omzet
  await expect(page.getByText("Rp 4.200.000")).toBeVisible(); // collected
  await expect(page.getByText("33.3%", { exact: true })).toBeVisible(); // margin
  await expect(page.getByText("Rp 300.000")).toBeVisible(); // outstanding DP
  await expect(
    page.getByRole("region", { name: "Ringkasan KPI" }).getByText("Rp 250.000"),
  ).toBeVisible(); // loss stok net

  // Loss Stok breakdown rows
  await expect(page.getByText("Waste / Rusak")).toBeVisible();
  await expect(page.getByText("Tidak terklasifikasi")).toBeVisible();

  // Unclassified warning banner
  await expect(page.getByText(/belum ditandai alasannya/i)).toBeVisible();

  // Payment method row
  await expect(
    page.getByRole("listitem").filter({ hasText: "CASH" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "TRANSFER" }).first(),
  ).toBeVisible();

  // Top product / category / sales sections
  await expect(
    page.getByRole("listitem").filter({ hasText: "Kertas A4" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Alat Tulis" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Budi" }).first(),
  ).toBeVisible();
});

test("KPI info tooltip opens on click and closes on Esc", async ({
  appPage: page,
}) => {
  await page.goto("/financial-report");
  await expect(
    page.getByRole("heading", { name: "Laporan Keuangan" }),
  ).toBeVisible();

  const omzetTrigger = page.getByRole("button", {
    name: /Cara hitung Omzet/i,
  });
  await omzetTrigger.click();

  await expect(page.getByRole("tooltip")).toBeVisible();
  await expect(page.getByRole("tooltip")).toContainText(
    "subtotal item − diskon item",
  );

  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).not.toBeVisible();
});

test("export menu opens and walks format → period steps", async ({
  appPage: page,
}) => {
  await page.goto("/financial-report");
  await expect(
    page.getByRole("heading", { name: "Laporan Keuangan" }),
  ).toBeVisible();

  // Step 1: Open menu
  await page.getByRole("button", { name: "Ekspor" }).click();
  await expect(page.getByText("Pilih format")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Excel/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^PDF/ })).toBeVisible();

  // Step 2: Pick format → period step appears with back button
  await page.getByRole("menuitem", { name: /Excel/ }).click();
  await expect(page.getByText("Excel · Pilih periode")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Harian/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Mingguan/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Bulanan/ })).toBeVisible();

  // Step 3: Back to format selection
  await page.getByRole("button", { name: "Kembali" }).click();
  await expect(page.getByText("Pilih format")).toBeVisible();

  // Escape closes the menu
  await page.keyboard.press("Escape");
  await expect(page.getByText("Pilih format")).not.toBeVisible();
});

test("Excel export downloads xlsx file with daily laporan data", async ({
  appPage: page,
}) => {
  await page.goto("/financial-report");
  await expect(
    page.getByRole("heading", { name: "Laporan Keuangan" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ekspor" }).click();
  await page.getByRole("menuitem", { name: /Excel/ }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /Harian/ }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^laporan-keuangan-daily-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );

  // Menu closes after successful export
  await expect(page.getByText("Pilih format")).not.toBeVisible();
});

test("PDF export downloads pdf file with weekly laporan data", async ({
  appPage: page,
}) => {
  await page.goto("/financial-report");
  await expect(
    page.getByRole("heading", { name: "Laporan Keuangan" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ekspor" }).click();
  await page.getByRole("menuitem", { name: /^PDF/ }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /Mingguan/ }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^laporan-keuangan-weekly-\d{4}-\d{2}-\d{2}\.pdf$/,
  );
});

test("export shows error message when laporan API fails", async ({ page }) => {
  await authenticate(page, "OWNER");
  await mockApis(page);
  // Override laporan endpoint to fail — registered after mockApis so it wins.
  await page.route("**/api/finance/report/journal**", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "Gagal memuat laporan" }),
    });
  });

  await page.goto("/financial-report");
  await expect(
    page.getByRole("heading", { name: "Laporan Keuangan" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ekspor" }).click();
  await page.getByRole("menuitem", { name: /Excel/ }).click();
  await page.getByRole("menuitem", { name: /Harian/ }).click();

  await expect(page.getByText("Gagal memuat laporan")).toBeVisible();
  // Menu stays open with period selector when there's an error
  await expect(page.getByText("Excel · Pilih periode")).toBeVisible();
});

test("sales role cannot access financial report and is redirected", async ({
  page,
}) => {
  await authenticate(page, "SALES");
  await mockApis(page);
  await page.goto("/financial-report");
  await expect(page).toHaveURL(/\/pos/);
});
