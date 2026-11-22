import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ data: undefined as Record<string, unknown> | undefined }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/hooks/useTransactions", () => ({ useTransactions: () => ({ data: [], isLoading: false }) }));
vi.mock("@/features/dashboard/hooks/useDashboard", () => ({ useDashboard: () => ({ data: state.data, isLoading: state.data === undefined }) }));
vi.mock("@/features/dashboard/components/RevenueTrendChart", () => ({ RevenueTrendChart: () => null }));
vi.mock("@/features/dashboard/components/ActiveDpList", () => ({ ActiveDpList: () => null }));
vi.mock("@/features/dashboard/components/TopProductsList", () => ({ TopProductsList: () => null }));
vi.mock("@/features/dashboard/components/RecentTransactionsList", () => ({ RecentTransactionsList: () => null }));
vi.mock("@/features/dashboard/components/LowStockList", () => ({ LowStockList: () => null }));
import DashboardPage from "@/app/(main)/dashboard/page";

describe("tampilan pemasukan Dashboard", () => {
  beforeEach(() => {
    state.data = {
      todayRevenue: 80_000, todaySalesRevenue: 100_000, todayProfit: 40_000,
      monthlyRevenue: 120_000, monthlySalesRevenue: 200_000, monthlyProfit: 40_000,
      paymentMixToday: [], revenueChart: [], totalOutstandingDP: 0, dpTransactions: [],
      receivableBalance: 125_000,
      topSalespersons: [], topCustomers: [], topProducts: [], lowStockProducts: [], productionStatusCounts: [], totalProducts: 0,
    };
  });

  it("mempertahankan margin berbasis penjualan ketika pemasukan kas berbeda", () => {
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(html).toContain("40.0");
    expect(html).toContain("20.0");
    expect(html).not.toContain("50.0");
  });

  it("menjelaskan angka dan metode yang tidak diizinkan tanpa menampilkannya sebagai nol", () => {
    state.data = { ...state.data, todayRevenue: null, monthlyRevenue: null, paymentMixToday: null };
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(html).toContain("Tidak memiliki izin");
    expect(html).toContain("Metode pembayaran belum diizinkan");
  });

  it("menampilkan saldo Piutang dan menjelaskan batas angka Outstanding DP", () => {
    const html = renderToStaticMarkup(<DashboardPage />);

    expect(html).toContain("Piutang");
    expect(html).toContain("125.000");
    expect(html).toContain("Sisa transaksi berstatus DP. Tidak termasuk Tempo atau Piutang Manual.");
  });

  it("tidak menampilkan kartu Piutang sebelum data izin Dashboard dimuat", () => {
    state.data = undefined;

    const html = renderToStaticMarkup(<DashboardPage />);

    expect(html).not.toContain(">Piutang</p>");
  });

  it("menyembunyikan saldo Piutang ketika role tidak punya izin membacanya", () => {
    state.data = { ...state.data, receivableBalance: null };

    const html = renderToStaticMarkup(<DashboardPage />);

    expect(html.includes("Tidak memiliki izin")).toBe(false);
    expect(html.includes("xl:grid-cols-5")).toBe(true);
  });
});
