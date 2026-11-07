import { readFile } from "node:fs/promises";
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
  // Profit and margin KPI cards were intentionally removed from the full report.
  const summary = page.getByRole("region", { name: "Ringkasan KPI" });
  for (const label of ["Laba Kotor", "Laba Bersih (Estimasi)", "Margin"]) {
    await expect(summary.getByText(label, { exact: true })).toHaveCount(0);
  }
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

test("export dialog opens with monthly report and journal format and period controls", async ({
  appPage: page,
}) => {
  await page.goto("/financial-report");
  await expect(
    page.getByRole("heading", { name: "Laporan Keuangan" }),
  ).toBeVisible();

  const trigger = page.getByRole("button", { name: "Ekspor", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Ekspor laporan keuangan" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Jenis laporan")).toHaveValue("monthly");
  await expect(dialog.getByLabel("Bulan", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Tahun", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Unduh Excel", exact: true })).toBeVisible();

  await dialog.getByLabel("Jenis laporan").selectOption("journal");
  await expect(dialog.getByLabel("Format", { exact: true })).toHaveValue("xlsx");
  await expect(dialog.getByLabel("Periode jurnal").getByRole("option")).toHaveText([
    "Harian · Hari ini",
    "Mingguan · 7 hari terakhir",
    "30 hari terakhir",
    "Bulanan · Bulan berjalan",
  ]);
  await dialog.getByLabel("Format", { exact: true }).selectOption("pdf");
  await expect(dialog.getByRole("button", { name: "Unduh PDF", exact: true })).toBeVisible();
  await dialog.getByLabel("Jenis laporan").selectOption("monthly");
  await expect(dialog.getByLabel("Bulan", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("Excel export downloads xlsx file with daily laporan data", async ({
  appPage: page,
}) => {
  await page.goto("/financial-report");
  await expect(
    page.getByRole("heading", { name: "Laporan Keuangan" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ekspor" }).click();
  const dialog = page.getByRole("dialog", { name: "Ekspor laporan keuangan" });
  await dialog.getByLabel("Jenis laporan").selectOption("journal");
  await dialog.getByLabel("Format", { exact: true }).selectOption("xlsx");
  await dialog.getByLabel("Periode jurnal").selectOption("daily");

  const requestPromise = page.waitForRequest("**/api/finance/report/journal?period=daily");
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Unduh Excel", exact: true }).click();
  await requestPromise;
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^laporan-keuangan-daily-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const { default: XLSX } = await import("xlsx-js-style");
  const workbook = XLSX.read(await readFile(downloadPath!), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Laporan, { header: 1 });
  expect(rows).toContainEqual([
    "2026-05-20", "INV-20260520-0001", "Budi", "Kertas A4", "Alat Tulis", "Pemasukan", 100_000, "CASH",
  ]);
  await expect(dialog).not.toBeVisible();
});

test("PDF export downloads pdf file with weekly laporan data", async ({
  appPage: page,
}) => {
  await page.goto("/financial-report");
  await expect(
    page.getByRole("heading", { name: "Laporan Keuangan" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ekspor" }).click();
  const dialog = page.getByRole("dialog", { name: "Ekspor laporan keuangan" });
  await dialog.getByLabel("Jenis laporan").selectOption("journal");
  await dialog.getByLabel("Format", { exact: true }).selectOption("pdf");
  await dialog.getByLabel("Periode jurnal").selectOption("weekly");

  const requestPromise = page.waitForRequest("**/api/finance/report/journal?period=weekly");
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Unduh PDF", exact: true }).click();
  await requestPromise;
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^laporan-keuangan-weekly-\d{4}-\d{2}-\d{2}\.pdf$/,
  );
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const content = await readFile(downloadPath!);
  expect(content.subarray(0, 5).toString()).toBe("%PDF-");
  await expect(dialog).not.toBeVisible();
});

test("export keeps journal selections after an API error and allows retry", async ({ page }) => {
  await authenticate(page, "OWNER");
  await mockApis(page);
  let fail = true;
  await page.route("**/api/finance/report/journal**", async (route) => {
    if (!fail) return route.fallback();
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
  const dialog = page.getByRole("dialog", { name: "Ekspor laporan keuangan" });
  await dialog.getByLabel("Jenis laporan").selectOption("journal");
  await dialog.getByLabel("Format", { exact: true }).selectOption("xlsx");
  await dialog.getByLabel("Periode jurnal").selectOption("daily");
  await dialog.getByRole("button", { name: "Unduh Excel", exact: true }).click();

  await expect(dialog.getByRole("alert")).toHaveText("Gagal memuat laporan");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Jenis laporan")).toHaveValue("journal");
  await expect(dialog.getByLabel("Format", { exact: true })).toHaveValue("xlsx");
  await expect(dialog.getByLabel("Periode jurnal")).toHaveValue("daily");

  fail = false;
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Coba lagi", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^laporan-keuangan-daily-\d{4}-\d{2}-\d{2}\.xlsx$/);
  await expect(dialog).not.toBeVisible();
});

test("sales role sees daily income without full financial reports", async ({
  page,
}) => {
  await authenticate(page, "SALES");
  await mockApis(page);
  let fullReportRequests = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/finance/report") fullReportRequests++;
  });
  await page.route("**/api/finance/report/daily?*", route => {
    const date = new URL(route.request().url()).searchParams.get("date");
    return route.fulfill({ json: {
      date,
      total: 100_000,
      outstandingDp: 25_000,
      categories: [{ category: "ATK", amount: 100_000 }],
      subcategories: [{ category: "ATK", subcategory: "Alat Tulis", amount: 100_000 }],
      paymentMethods: [{ method: "CASH", amount: 100_000 }],
    } });
  });

  await page.goto("/financial-report");
  await expect(page.getByRole("heading", { name: "Pemasukan Harian" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Total Pemasukan" })).toBeVisible();
  const outstanding = page.locator("section").filter({ has: page.getByRole("heading", { name: "Outstanding DP", exact: true }) });
  await expect(outstanding.getByText("Rp 25.000", { exact: true })).toBeVisible();
  await expect(outstanding).toContainText("bukan saldo historis");
  await expect(page.getByRole("heading", { name: "Pemasukan per Kategori" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pemasukan per Subkategori" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pemasukan per Metode Pembayaran" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Laporan Keuangan", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ekspor", exact: true })).toHaveCount(0);
  expect(fullReportRequests).toBe(0);
});

test("owner can preview the Sales daily report and return using the keyboard on mobile", async ({ appPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let requestedView: string | null = null;
  await page.route("**/api/finance/report/daily?*", route => {
    const params = new URL(route.request().url()).searchParams;
    requestedView = params.get("view");
    return route.fulfill({ json: {
      date: params.get("date"), total: 25_000, outstandingDp: 25_000,
      categories: [{ category: "Percetakan", amount: 25_000 }],
      subcategories: [{ category: "Percetakan", subcategory: "Spanduk", amount: 25_000 }],
      paymentMethods: [{ method: "CASH", amount: 25_000 }],
    } });
  });
  await page.goto("/financial-report");
  const salesView = page.getByRole("button", { name: "Lihat sebagai Sales", exact: true });
  await expect(salesView).toHaveAttribute("aria-pressed", "false");
  await salesView.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Pemasukan Harian", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Outstanding DP", exact: true })).toBeVisible();
  await expect(salesView).toHaveAttribute("aria-pressed", "true");
  await expect(salesView).toBeFocused();
  expect(requestedView).toBe("sales");
  await expect(page.getByRole("heading", { name: "Laporan Keuangan", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const fullView = page.getByRole("button", { name: "Laporan Lengkap", exact: true });
  await fullView.focus();
  await page.keyboard.press("Space");
  await expect(fullView).toHaveAttribute("aria-pressed", "true");
  await expect(fullView).toBeFocused();
  await expect(page.getByRole("heading", { name: "Laporan Keuangan", exact: true })).toBeVisible();
});
