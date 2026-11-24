import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CashFlowSummary, SupplierDebtSummary } from "@/features/keuangan/hooks/useKeuangan";

const state = vi.hoisted(() => ({
  data: undefined as Record<string, unknown> | undefined,
  cashFlow: undefined as CashFlowSummary | undefined,
  financePermissions: [] as string[],
  financePage: true,
  cashFlowError: false,
  loadCashFlow: vi.fn(),
  supplierDebt: undefined as SupplierDebtSummary | undefined,
  loadSupplierDebt: vi.fn(),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({
    canPerform: (resource: string, action: string) => action === "read" && state.financePermissions.includes(resource),
    canAccess: (path: string) => path === "/keuangan" && state.financePage,
  }),
}));
vi.mock("@/features/keuangan/hooks/useKeuangan", () => ({
  useCashFlowSummary: (month: string, enabled: boolean) => {
    if (enabled) state.loadCashFlow(month);
    return { data: state.cashFlow, isLoading: false, isError: state.cashFlowError };
  },
  useSupplierDebtSummary: (enabled: boolean) => {
    if (enabled) state.loadSupplierDebt();
    return { data: state.supplierDebt, isLoading: false, isError: false };
  },
}));
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
    state.loadCashFlow.mockClear();
    state.loadSupplierDebt.mockClear();
    state.supplierDebt = undefined;
    state.financePermissions = ["income", "expense"];
    state.financePage = true;
    state.cashFlowError = false;
    state.data = {
      todayRevenue: 80_000, todaySalesRevenue: 100_000, todayProfit: 40_000,
      monthlyRevenue: 120_000, monthlySalesRevenue: 200_000, monthlyProfit: 40_000,
      paymentMixToday: [], revenueChart: [], totalOutstandingDP: 0, dpTransactions: [],
      receivableBalance: 125_000,
      topSalespersons: [], topCustomers: [], topProducts: [], lowStockProducts: [], productionStatusCounts: [], totalProducts: 0,
    };
    state.cashFlow = {
      month: "2026-11",
      income: {
        total: 200_000, supplierRefund: 20_000, transactionCount: 2, manualEntryCount: 1, daily: [],
        components: { sales: 150_000, manualIncome: 10_000, manualReceivable: 20_000 },
      },
      expense: {
        total: 64_500.25, incomplete: false, daily: [], byCategory: [], entryCount: 2,
        components: { manual: 0, transfer: 0, giroPayment: 14_500.25, giroDue: 50_000, overpayment: 0 },
      },
    };
  });

  it("menampilkan angka Keuangan beserta sumbernya pada bulan berjalan WIB", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-31T17:00:00Z"));
      const html = renderToStaticMarkup(<DashboardPage />);
      expect(state.loadCashFlow).toHaveBeenCalledWith("2026-11");
      expect(html).toContain("Arus Kas Bulan Ini");
      expect(html).toContain('dateTime="2026-11"');
      expect(html).toContain("Penerimaan Hari Ini");
      expect(html).toContain("Penerimaan Bulan Ini");
      expect(html).toContain("200.000");
      expect(html).toContain("64.500,25");
      expect(html).toContain("135.499,75");
      expect(html).toContain("Lihat cara perhitungan");
      expect(html).toContain("Pengembalian dana pemasok");
      expect(html).toContain("Setiap bagian giro masuk mulai tanggal jatuh temponya");
      expect(html).toContain('href="/keuangan?month=2026-11#riwayat-pengeluaran"');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([{ permissions: [] }, { permissions: ["income"] }, { permissions: ["expense"] }])("menyembunyikan arus kas untuk izin $permissions", ({ permissions }) => {
    state.financePermissions = permissions;
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(state.loadCashFlow).not.toHaveBeenCalled();
    expect(html).not.toContain("Arus Kas Bulan Ini");
    expect(html).not.toContain("135.499,75");
  });

  it("menunjukkan porsi pengeluaran dan menggabungkan dua bagian giro sebagai komponen terbesar", () => {
    state.cashFlow = {
      ...state.cashFlow!,
      expense: {
        ...state.cashFlow!.expense,
        total: 66_000,
        components: { manual: 30_000, transfer: 0, giroPayment: 16_000, giroDue: 20_000, overpayment: 0 },
      },
    };
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(html).toContain("33% dari pemasukan");
    expect(html).toContain('aria-label="Informasi Beban pengeluaran"');
    expect(html).toContain('aria-label="Informasi Komponen pengeluaran terbesar"');
    expect(html).toContain("Komponen pengeluaran terbesar");
    expect(html).toMatch(/Giro jatuh tempo · Rp\s*36\.000/);
    expect(html).toContain("54,5% dari total pengeluaran");
  });

  it("menunjukkan saldo hutang dan sumbernya meski ringkasan arus kas gagal", () => {
    state.financePermissions.push("expense.giro", "expense.payable");
    state.cashFlowError = true;
    state.supplierDebt = { asOf: "2026-11-24", total: 125_000.25, giroKnown: 100_000, manual: 25_000.25, unknownGiroCount: 0 };
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(state.loadSupplierDebt).toHaveBeenCalled();
    expect(html).toContain('aria-label="Informasi Saldo Hutang Pemasok"');
    expect(html).toContain("125.000,25");
    expect(html).toContain("Sisa Giro");
    expect(html).toContain("Hutang manual");
    expect(html).toContain("24 November 2026");
    expect(html).toContain('href="/keuangan#supplier-payables-title"');
  });

  it("menampilkan komponen yang diketahui saat total hutang belum lengkap", () => {
    state.financePermissions.push("expense.giro", "expense.payable");
    state.supplierDebt = { asOf: "2026-11-24", total: null, giroKnown: 42_500, manual: 25_000, unknownGiroCount: 2 };
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(html).toContain("Saldo belum lengkap");
    expect(html).toContain("42.500");
    expect(html).toContain("Saldo 2 pembelian giro belum diketahui.");
  });

  it.each([
    { permissions: ["expense.giro"], page: true },
    { permissions: ["expense.payable"], page: true },
    { permissions: ["expense.giro", "expense.payable"], page: false },
  ])("melewatkan ringkasan hutang tanpa izin yang lengkap", ({ permissions, page }) => {
    state.financePermissions.push(...permissions);
    state.financePage = page;
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(state.loadSupplierDebt).not.toHaveBeenCalled();
    expect(html).not.toContain("Saldo Hutang Pemasok");
  });

  it("tetap menunjukkan komponen terbesar saat belum ada pemasukan", () => {
    state.cashFlow = { ...state.cashFlow!, income: { ...state.cashFlow!.income, total: 0 } };
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(html).not.toContain("Beban pengeluaran");
    expect(html).toContain("Komponen pengeluaran terbesar");
    expect(html).toContain("100% dari total pengeluaran");
  });

  it("menandai angka yang belum lengkap dan tidak menautkan halaman Keuangan tanpa akses halaman", () => {
    state.financePage = false;
    state.cashFlow = { ...state.cashFlow!, expense: { ...state.cashFlow!.expense, total: null, incomplete: true } };
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(html).toContain("200.000");
    expect(html).toContain("Belum tersedia");
    expect(html).toContain("Riwayat pengeluaran belum lengkap");
    expect(html.indexOf("Riwayat pengeluaran belum lengkap")).toBeLessThan(html.indexOf("<details"));
    expect(html).not.toContain("Beban pengeluaran");
    expect(html).not.toContain("Komponen pengeluaran terbesar");
    expect(html).not.toContain("135.499,75");
    expect(html).not.toContain("Lihat riwayat pengeluaran");
  });

  it("menjelaskan saldo negatif tanpa menghilangkan tanda minus atau pecahan rupiah", () => {
    state.cashFlow = { ...state.cashFlow!, income: { ...state.cashFlow!.income, total: 50_000 } };
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(html).toContain("Pengeluaran melebihi pemasukan");
    expect(html).toMatch(/[-−]Rp\s*14\.500,25/);
  });

  it("menampilkan pesan gagal ketika ringkasan arus kas tidak bisa dimuat", () => {
    state.cashFlowError = true;
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(html).toContain("Ringkasan arus kas belum tersedia.");
    expect(html).not.toContain("135.499,75");
  });

  it("mempertahankan margin berbasis penjualan ketika pemasukan kas berbeda", () => {
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(html).toContain("margin 40.0%");
    expect(html).toContain("margin 20.0%");
    expect(html).not.toContain("margin 50.0%");
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
