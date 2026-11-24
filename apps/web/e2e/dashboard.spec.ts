import { test, expect } from "./fixtures/app";

test("dashboard shows business KPIs and drill-down widgets", async ({
  appPage: page,
}) => {
  await page.clock.setFixedTime(new Date("2026-05-20T03:00:00Z"));
  await page.route("**/api/finance/giro?summary=1", route => route.fulfill({
    json: { asOf: "2026-05-20", total: 625_000, giroKnown: 500_000, manual: 125_000, unknownGiroCount: 0 },
  }));
  const cashFlowResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/finance/cash-flow/summary" &&
    new URL(response.url()).searchParams.get("month") === "2026-05" && response.ok(),
  );
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Penerimaan Hari Ini", { exact: true })).toBeVisible();
  await expect(page.getByText("Outstanding DP")).toBeVisible();
  await expect(page.getByText("Rina Sales")).toBeVisible();
  await expect(page.getByText("Budi").first()).toBeVisible();
  await expect(page.getByText("Transaksi Terbaru")).toBeVisible();

  await cashFlowResponse;
  const cashFlow = page.locator("section").filter({ has: page.getByRole("heading", { name: "Arus Kas Bulan Ini" }) });
  await expect(cashFlow.getByText(/45\.000\.000/).first()).toBeVisible();
  await expect(cashFlow.getByText(/850\.000/).first()).toBeVisible();
  await expect(cashFlow.getByText(/44\.150\.000/).first()).toBeVisible();
  const debt = cashFlow.getByRole("region", { name: "Saldo Hutang Pemasok" });
  await expect(debt.getByText(/625\.000/)).toBeVisible();
  await expect(debt.getByRole("link", { name: "Lihat rincian hutang" })).toHaveAttribute("href", "/keuangan#supplier-payables-title");
  const info = cashFlow.getByRole("button", { name: "Informasi Beban pengeluaran" });
  await info.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tooltip")).toContainText(/850\.000.*45\.000\.000.*1,9%/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toBeHidden();
  await cashFlow.getByText("Lihat cara perhitungan").click();
  await expect(cashFlow.getByText(/Setiap bagian giro masuk mulai tanggal jatuh temponya/)).toBeVisible();
  await cashFlow.getByRole("link", { name: "Lihat riwayat pengeluaran" }).click();
  await expect(page).toHaveURL(/\/keuangan\?month=2026-05#riwayat-pengeluaran$/, { timeout: 30_000 });
  await expect(page.locator("#riwayat-pengeluaran").getByText(/850\.000/).first()).toBeVisible({ timeout: 15_000 });
});
