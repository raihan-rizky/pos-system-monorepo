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
import { ReportExportMenu } from "../ReportExportMenu";

const fullReport = { dateFrom: "2026-11-05", dateTo: "2026-11-05", summary: {}, topProducts: [], salespersons: [], categories: [], subcategories: [], paymentMethods: [], shifts: [], lossStok: [], trend: [] };
describe("daily financial report UI", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-05T03:00:00Z"));
    mocks.role.mockReturnValue({ role: "SALES", userId: "sales", storeId: "store-1", authorizationFingerprint: "v1", canAccess: () => true, canPerform: (target: string) => target === "transaction" || target === "customer.receivable" || target.startsWith("financial-report.daily-") });
    mocks.daily.mockReturnValue({ data: { date: "2026-11-05", total: 100, outstandingDp: 25, receivableBalance: 45, categories: [{ category: "ATK", amount: 100 }], subcategories: [{ category: "ATK", subcategory: "Alat Tulis", amount: 100 }], paymentMethods: [{ method: "CASH", amount: 100 }] }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() });
    mocks.full.mockReturnValue({ data: fullReport, isLoading: false, isFetching: false, error: null });
  });
  afterEach(() => vi.useRealTimers());

  it("shows all daily sections and a single date picker without invoking full-report fetching", () => {
    const html = renderToStaticMarkup(createElement(FinancialReportPage));
    for (const label of ["Pemasukan Harian", "Total Pemasukan", "Outstanding DP", "Piutang", "Pemasukan per Kategori", "Pemasukan per Subkategori", "Pemasukan per Metode Pembayaran", "Alat Tulis"]) expect(html).toContain(label);
    expect(html).toContain("Sisa transaksi berstatus DP. Tidak termasuk Tempo atau Piutang Manual.");
    expect(html).toContain('type="date"');
    expect(html).toContain('max="2026-11-05"');
    for (const forbidden of ["Laba", "HPP", "Pengeluaran", "Sales Teratas", "Produk Terlaris", "Ekspor", "Bulan ini"]) expect(html).not.toContain(forbidden);
    expect(mocks.full).not.toHaveBeenCalled();
  });
  it("shows fractional amounts in the daily total and payment breakdown", () => {
    mocks.daily.mockReturnValue({ data: { date: "2026-11-05", total: 0.99, outstandingDp: 0.01, categories: [{ category: "ATK", amount: 0.99 }], subcategories: [], paymentMethods: [{ method: "CASH", amount: 0.5 }, { method: "TRANSFER", amount: 0.49 }] }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() });
    const html = renderToStaticMarkup(createElement(FinancialReportPage));
    for (const amount of ["0,99", "0,01", "0,5", "0,49"]) expect(html).toContain(amount);
  });
  it("opens receipt details from the total while keeping other receipt links", () => {
    const html = renderToStaticMarkup(createElement(DailyIncomeReport));
    for (const query of ["mode=receipt&amp;date=2026-11-05", "category=ATK", "subcategory=Alat+Tulis", "method=CASH", "mode=outstanding-dp&amp;date=2026-11-05"]) expect(html).toContain(query);
    expect(html).toMatch(/<button[^>]+aria-label="Lihat rincian Total Pemasukan:/);
    expect(html).toMatch(/<button[^>]*>Lihat rincian pemasukan/);
  });
  it("does not link amounts when transaction history is unavailable", () => {
    mocks.role.mockReturnValue({ canAccess: (path: string) => path !== "/history", canPerform: () => true });
    const html = renderToStaticMarkup(createElement(DailyIncomeReport));
    expect(html).not.toContain('href="/history?');
    expect(html).toContain("Akses Riwayat belum diizinkan");
  });
  it("uses saved Sales receipt permissions in Owner preview", () => {
    mocks.role.mockReturnValue({ role: "OWNER", canAccess: () => true, canPerform: () => true });
    mocks.daily.mockReturnValue({ data: { date: "2026-11-05", total: 100, receiptHistoryAccess: { total: false } }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() });
    const html = renderToStaticMarkup(<DailyIncomeReport previewSales />);
    expect(html).not.toContain('href="/history?');
    expect(html).toContain("Akses Riwayat belum diizinkan");
  });
  it("does not display denied cached sections even if old query data contains them", () => {
    mocks.role.mockReturnValue({ canAccess: () => true, canPerform: (target: string) => target === "financial-report.daily-payment-method" });
    const html = renderToStaticMarkup(createElement(FinancialReportPage));
    expect(html).toContain("Pemasukan per Metode Pembayaran");
    for (const label of ["Total Pemasukan", "Pemasukan per Kategori", "Pemasukan per Subkategori", "Alat Tulis"]) expect(html).not.toContain(label);
    expect(mocks.full).not.toHaveBeenCalled();
  });
  it("allows the normal daily view to use a granted full-report permission", () => {
    mocks.role.mockReturnValue({ role: "ADMIN", canAccess: () => true, canPerform: (target: string) => target === "financial-report" || target === "transaction" });
    const html = renderToStaticMarkup(createElement(DailyIncomeReport));
    expect(html).toContain("Total Pemasukan");
    expect(html).toContain("Pemasukan per Metode Pembayaran");
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
    expect(html).not.toMatch(/<button[^>]*>Pemasukan Harian<\/button>/);
    expect(mocks.full).toHaveBeenCalledOnce();
    expect(mocks.daily).not.toHaveBeenCalled();
  });
  it("offers the normal daily view to full-report roles even when comparison access is denied", () => {
    mocks.role.mockReturnValue({ role: "ADMIN", canAccess: () => true, canPerform: (target: string) => target === "financial-report" || target === "financial-report.daily-comparison" });
    expect(renderToStaticMarkup(createElement(FinancialReportPage))).toMatch(/<button[^>]*>Pemasukan Harian<\/button>/);
    mocks.role.mockReturnValue({ role: "ADMIN", canAccess: () => true, canPerform: (target: string) => target === "financial-report" });
    expect(renderToStaticMarkup(createElement(FinancialReportPage))).toMatch(/<button[^>]*>Pemasukan Harian<\/button>/);
  });
  it("menampilkan pecahan rupiah pada omzet laporan lengkap", () => {
    mocks.role.mockReturnValue({ role: "OWNER", canAccess: () => true, canPerform: () => true });
    mocks.full.mockReturnValue({ data: { ...fullReport, summary: { revenue: 0.99 } }, isLoading: false, isFetching: false, error: null });
    expect(renderToStaticMarkup(createElement(FinancialReportPage))).toContain("0,99");
  });
  it("menampilkan pecahan rupiah pada saldo piutang", () => {
    mocks.role.mockReturnValue({ role: "OWNER", canAccess: () => true, canPerform: () => true });
    mocks.full.mockReturnValue({ data: { ...fullReport, summary: { receivableBalance: 0.33 } }, isLoading: false, isFetching: false, error: null });
    const html = renderToStaticMarkup(createElement(FinancialReportPage));
    expect(html).toContain("Piutang");
    expect(html).toContain("0,33");
  });
  it("menampilkan pecahan rupiah pada rincian kategori laporan lengkap", () => {
    mocks.role.mockReturnValue({ role: "OWNER", canAccess: () => true, canPerform: () => true });
    mocks.full.mockReturnValue({ data: { ...fullReport, categories: [{ categoryName: "ATK", revenue: 0.33, grossProfit: 0.12, transactionCount: 1 }] }, isLoading: false, isFetching: false, error: null });
    const html = renderToStaticMarkup(createElement(FinancialReportPage));
    expect(html).toContain("0,33");
    expect(html).toContain("0,12");
  });
  it("tetap menampilkan laporan ketika data lama belum memuat subkategori", () => {
    mocks.role.mockReturnValue({ role: "OWNER", canAccess: () => true, canPerform: () => true });
    mocks.full.mockReturnValue({ data: { ...fullReport, subcategories: undefined }, isLoading: false, isFetching: false, error: null });
    const html = renderToStaticMarkup(createElement(FinancialReportPage));
    expect(html).toContain("Belum ada subkategori pada periode ini.");
  });
  it("menampilkan seluruh subkategori meskipun jumlahnya lebih dari seratus", () => {
    mocks.role.mockReturnValue({ role: "OWNER", canAccess: () => true, canPerform: () => true });
    const subcategories = Array.from({ length: 101 }, (_, index) => ({
      categoryName: "ATK", subcategoryName: `Subkategori ${index + 1}`, revenue: 101 - index, grossProfit: 0, transactionCount: 1,
    }));
    mocks.full.mockReturnValue({ data: { ...fullReport, subcategories }, isLoading: false, isFetching: false, error: null });
    const html = renderToStaticMarkup(createElement(FinancialReportPage));
    expect(html).toContain("Subkategori 101");
  });
  it("allows reading only outstanding DP without a total-income grant", () => {
    mocks.role.mockReturnValue({ role: "SALES", canAccess: () => true, canPerform: (target: string) => target === "financial-report.daily-outstanding-dp" });
    const html = renderToStaticMarkup(createElement(FinancialReportPage));
    expect(html).toContain("Outstanding DP");
    expect(html).toMatch(/Rp\s*25/);
    expect(html).not.toContain("Total Pemasukan");
  });
  it("allows the receivable KPI as the only daily metric when transaction and receivable reads are granted", () => {
    mocks.role.mockReturnValue({ role: "SALES", canAccess: () => true, canPerform: (target: string) => target === "transaction" || target === "customer.receivable" });
    mocks.daily.mockReturnValue({ data: { date: "2026-11-05", receivableBalance: 500 }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() });

    const html = renderToStaticMarkup(createElement(FinancialReportPage));

    expect(html).toMatch(/<h2[^>]*>Piutang<\/h2>/);
    expect(html).toMatch(/Rp\s*500/);
    expect(html).not.toContain("Total Pemasukan");
    expect(mocks.daily).toHaveBeenCalledWith("2026-11-05", expect.objectContaining({ receivableBalance: true }), false);
  });
  it.each([["transaction", "customer.receivable"], ["customer.receivable", "transaction"]] as const)("hides a cached Piutang card when %s read is denied", (deniedTarget, grantedTarget) => {
    mocks.role.mockReturnValue({ role: "SALES", canAccess: () => true, canPerform: (target: string) => target === grantedTarget || target === "financial-report.daily-outstanding-dp" });
    mocks.daily.mockReturnValue({ data: { date: "2026-11-05", outstandingDp: 25, receivableBalance: 500 }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() });

    const html = renderToStaticMarkup(createElement(FinancialReportPage));

    expect(html).toContain("Outstanding DP");
    expect(html).not.toMatch(/<h2[^>]*>Piutang<\/h2>/);
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
  it("uses saved Sales export access when previewing the export control", () => {
    mocks.role.mockReturnValue({ role: "OWNER", canAccess: () => true, canPerform: () => true });
    expect(renderToStaticMarkup(<ReportExportMenu previewSales previewExportAccess={false} />)).not.toContain("Ekspor");
    expect(renderToStaticMarkup(<ReportExportMenu previewSales previewExportAccess />)).toContain("Ekspor");
  });
  it("menjelaskan izin yang dibutuhkan sebelum ekspor bulanan", () => {
    mocks.role.mockReturnValue({ role: "ADMIN", canAccess: () => true, canPerform: () => true });
    const html = renderToStaticMarkup(<ReportExportMenu />);
    expect(html).toContain("Ekspor bulanan memerlukan akses Riwayat");
    expect(html).toContain("pengelola hak akses");
  });
  it("forwards the saved Sales export access to the full preview", () => {
    mocks.role.mockReturnValue({ role: "OWNER", canAccess: () => true, canPerform: () => true });
    mocks.daily.mockReturnValue({ data: { date: "2026-11-05", viewMode: "full", exportAccess: false }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() });
    const preview = vi.fn((allowed: boolean) => <p>{allowed ? "Diizinkan" : "Tidak diizinkan"}</p>);
    expect(renderToStaticMarkup(<DailyIncomeReport previewSales fullReportPreview={preview} />)).toContain("Tidak diizinkan");
    expect(preview).toHaveBeenCalledWith(false);
  });
});
