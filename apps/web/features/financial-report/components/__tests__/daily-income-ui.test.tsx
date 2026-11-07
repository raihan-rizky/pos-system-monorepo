import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ role: vi.fn(), daily: vi.fn(), full: vi.fn() }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: mocks.role }));
vi.mock("@/features/financial-report/hooks/useDailyIncome", () => ({ useDailyIncome: mocks.daily }));
vi.mock("@/features/financial-report/hooks/useFinancialReport", () => ({ useFinancialReport: mocks.full }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
import FinancialReportPage from "@/app/(main)/financial-report/page";
import { DailyIncomeReport } from "../DailyIncomeReport";

const fullReport = { dateFrom: "2026-11-05", dateTo: "2026-11-05", summary: {}, topProducts: [], salespersons: [], categories: [], subcategories: [], paymentMethods: [], shifts: [], lossStok: [], trend: [] };
describe("daily financial report UI", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-05T03:00:00Z"));
    mocks.role.mockReturnValue({ role: "SALES", userId: "sales", storeId: "store-1", authorizationFingerprint: "v1", canAccess: () => true, canPerform: (target: string) => target.startsWith("financial-report.daily-") });
    mocks.daily.mockReturnValue({ data: { date: "2026-11-05", total: 100, outstandingDp: 25, categories: [{ category: "ATK", amount: 100 }], subcategories: [{ category: "ATK", subcategory: "Alat Tulis", amount: 100 }], paymentMethods: [{ method: "CASH", amount: 100 }] }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() });
    mocks.full.mockReturnValue({ data: fullReport, isLoading: false, isFetching: false, error: null });
  });
  afterEach(() => vi.useRealTimers());

  it("shows all daily sections and a single date picker without invoking full-report fetching", () => {
    const html = renderToStaticMarkup(createElement(FinancialReportPage));
    for (const label of ["Pemasukan Harian", "Total Pemasukan", "Outstanding DP", "Pemasukan per Kategori", "Pemasukan per Subkategori", "Pemasukan per Metode Pembayaran", "Alat Tulis"]) expect(html).toContain(label);
    expect(html).toContain('type="date"');
    expect(html).toContain('max="2026-11-05"');
    for (const forbidden of ["Laba", "HPP", "Pengeluaran", "Sales Teratas", "Produk Terlaris", "Ekspor", "Bulan ini"]) expect(html).not.toContain(forbidden);
    expect(mocks.full).not.toHaveBeenCalled();
  });
  it("does not display denied cached sections even if old query data contains them", () => {
    mocks.role.mockReturnValue({ canAccess: () => true, canPerform: (target: string) => target === "financial-report.daily-payment-method" });
    const html = renderToStaticMarkup(createElement(FinancialReportPage));
    expect(html).toContain("Pemasukan per Metode Pembayaran");
    for (const label of ["Total Pemasukan", "Pemasukan per Kategori", "Pemasukan per Subkategori", "Alat Tulis"]) expect(html).not.toContain(label);
    expect(mocks.full).not.toHaveBeenCalled();
  });
  it("hides the page and avoids financial requests if page access is revoked", () => {
    mocks.role.mockReturnValue({ canAccess: () => false, canPerform: () => true });
    const html = renderToStaticMarkup(createElement(FinancialReportPage));
    expect(html).toContain("belum diizinkan");
    expect(mocks.full).not.toHaveBeenCalled();
    expect(mocks.daily).not.toHaveBeenCalled();
  });
  it("retains full-report mode for users with full permission", () => {
    mocks.role.mockReturnValue({ role: "OWNER", canAccess: () => true, canPerform: () => true });
    const html = renderToStaticMarkup(createElement(FinancialReportPage));
    expect(html).toContain("Laporan Keuangan");
    expect(html).toContain("Lihat sebagai Sales");
    expect(mocks.full).toHaveBeenCalledOnce();
    expect(mocks.daily).not.toHaveBeenCalled();
  });
  it("allows reading only outstanding DP without a total-income grant", () => {
    mocks.role.mockReturnValue({ role: "SALES", canAccess: () => true, canPerform: (target: string) => target === "financial-report.daily-outstanding-dp" });
    const html = renderToStaticMarkup(createElement(FinancialReportPage));
    expect(html).toContain("Outstanding DP");
    expect(html).toMatch(/Rp\s*25/);
    expect(html).not.toContain("Total Pemasukan");
  });
  it("does not offer OWNER preview to ADMIN with full report access", () => {
    mocks.role.mockReturnValue({ role: "ADMIN", canAccess: () => true, canPerform: () => true });
    expect(renderToStaticMarkup(createElement(FinancialReportPage))).not.toContain("Lihat sebagai Sales");
  });
  it("renders the full-report preview when saved SALES grants select that view", () => {
    mocks.role.mockReturnValue({ role: "OWNER", canAccess: () => true, canPerform: () => true });
    mocks.daily.mockReturnValue({ data: { date: "2026-11-05", viewMode: "full" }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() });
    const html = renderToStaticMarkup(<DailyIncomeReport previewSales fullReportPreview={<p>Laporan Lengkap Sales</p>} />);
    expect(html).toContain("Laporan Lengkap Sales");
    expect(html).not.toContain("Pemasukan Harian");
    expect(mocks.daily).toHaveBeenCalledWith("2026-11-05", expect.anything(), true);
  });
});
