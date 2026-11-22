import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  incomplete: false, incomePermission: true, expensePermission: true,
  incomeError: false, expenseError: false, chart: null as unknown,
  incomeEnabled: null as unknown, expenseEnabled: null as unknown,
  incomeMetricsOnly: null as unknown, expenseMetricsOnly: null as unknown,
  cashFlowEnabled: null as unknown, cashFlowError: false, cashFlowLoading: false,
  expenseRows: [] as Array<Record<string, unknown>>,
  transferOldEdit: false, transferNewEdit: false,
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("month=2026-11") }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({
    isLoading: false,
    isError: false,
    data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } },
    refetch: vi.fn(),
  }),
}));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ canAccess: () => true, canPerform: (resource: string, action: string) => action === "read" ? (resource === "income" ? state.incomePermission : state.expensePermission) : action === "update" && resource === "expense.manual_transfer" ? state.transferOldEdit : action === "update" && resource === "expense.manual_transfer.edit" ? state.transferNewEdit : false }) }));
vi.mock("@/features/ai-assistant/hooks/useAssistantModalAction", () => ({ useAssistantModalAction: () => {} }));
vi.mock("@/features/keuangan/components/SupplierPayablesPanel", () => ({ SupplierPayablesPanel: () => null }));
vi.mock("@/features/keuangan/components/DeferredCashFlowChart", () => ({ DeferredCashFlowChart: (props: unknown) => { state.chart = props; return null; } }));
vi.mock("@/features/keuangan/hooks/useKeuangan", () => ({
  useCashFlowSummary: (_month: string, enabled: boolean) => {
    state.cashFlowEnabled = enabled;
    return { isLoading: state.cashFlowLoading, isError: state.cashFlowError, data: {
      income: { total: 190_000, transactionCount: 2, manualEntryCount: 1, daily: [{ date: "2026-11-03", total: 190_000, count: 2, manualCount: 1, manualReceivable: 30_000 }], components: { sales: 140_000, manualIncome: 20_000, manualReceivable: 30_000 } },
      expense: { total: state.incomplete ? null : 30_000, incomplete: state.incomplete, daily: [{ date: "2026-11-10", total: 30_000 }], byCategory: [{ category: "SUPPLIES", total: 30_000 }], entryCount: 1,
        components: { manual: 10_000, transfer: 0, giroPayment: 20_000, giroDue: 0, overpayment: 0 } },
    } };
  },
  // Deliberately keep cached data after permissions change: it must not appear in the UI.
  useIncomeSummary: (_month: string, enabled: boolean, metricsOnly = false) => {
    state.incomeEnabled = enabled;
    state.incomeMetricsOnly = metricsOnly;
    return { isLoading: false, isError: state.incomeError, data: { monthlyTotal: 222_222, transactionCount: 1, daily: [], cashTotal: 200_000, cashDaily: [{ date: "2026-11-03", total: 200_000 }] } };
  },
  useExpenseSummary: (_month: string, enabled: boolean, metricsOnly: boolean) => {
    state.expenseEnabled = enabled;
    state.expenseMetricsOnly = metricsOnly;
    return { isLoading: false, isError: state.expenseError, data: {
      monthlyTotal: 111_111, entryCount: 1, byCategory: [], daily: [],
      cashDaily: [{ date: "2026-11-10", total: 30_000 }],
      cashExpense: { total: state.incomplete ? null : 30_000, incomplete: state.incomplete },
    } };
  },
  useExpenseList: () => ({ isLoading: false, isError: false, data: { data: state.expenseRows, pagination: { total: state.expenseRows.length, totalPages: 1, page: 1 } } }),
  useCustomExpenseCategories: () => ({ data: { data: [] }, isError: false }),
}));
import KeuanganDashboardPage from "@/app/(main)/keuangan/page";

describe("ringkasan arus kas Keuangan", () => {
  beforeEach(() => Object.assign(state, { incomplete: false, incomePermission: true, expensePermission: true, incomeError: false, expenseError: false, cashFlowError: false, cashFlowLoading: false, cashFlowEnabled: null, chart: null, expenseRows: [], transferOldEdit: false, transferNewEdit: false }));

  it("menampilkan pecahan rupiah pada riwayat agar nominal dapat dicocokkan", () => {
    state.expenseRows = [{ id: "decimal", applicantName: "Pemasok", category: "SUPPLIES", description: "Pembayaran",
      occurredAt: "2026-11-10T00:00:00.000Z", source: { type: "GOODS_PURCHASE" },
      netAmount: 30_000.25, changeAmount: 1.5, attachmentUrl: null }];
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(html).toContain("30.000,25");
    expect(html).toContain("1,5");
  });

  it("menjelaskan nomor pembelian dan jadwal yang dialokasikan otomatis", () => {
    state.expenseRows = [{ id: "payment", applicantName: "Pemasok", category: "SUPPLIES", description: "Pembayaran",
      occurredAt: "2026-11-10T00:00:00.000Z", source: { type: "GOODS_PURCHASE", id: "p1", number: "PB-123" },
      recognitionKind: "giro_payment", allocation: { scheduleId: "g1", dueDate: "2026-12-15", source: "automatic" },
      netAmount: 30_000, changeAmount: 0, attachmentUrl: null }];
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(html).toContain("PB-123");
    expect(html).toContain("Alokasi otomatis");
    expect(html).toContain("15 Des 2026");
  });

  it("hanya menampilkan aksi ubah transfer ketika kedua izin edit tersedia", () => {
    state.expenseRows = [{ id: "e1", applicantName: "Pemasok", category: "SUPPLIES", amount: 1000, netAmount: 1000, changeAmount: 0, occurredAt: "2026-11-02T00:00:00Z", createdAt: "2026-11-02T00:00:00Z", description: "Kertas", source: { type: "MANUAL_TRANSFER_PURCHASE" }, recordedBy: { name: "Pengguna" } }];
    state.transferOldEdit = true;
    expect(renderToStaticMarkup(<KeuanganDashboardPage />)).not.toContain('aria-label="Aksi"');
    state.transferNewEdit = true;
    expect(renderToStaticMarkup(<KeuanganDashboardPage />)).toContain('aria-label="Aksi"');
  });

  it("menjelaskan pembayaran hutang sebagai baris otomatis dan komponen arus kas", () => {
    state.expenseRows = [{ id: "manual-payable:2026-11-10:ATK", applicantName: "Pembayaran hutang manual",
      category: "report:ATK", amount: 1000, netAmount: 1000, changeAmount: 0,
      occurredAt: "2026-11-09T17:00:00Z", description: null, source: { type: "MANUAL_PAYABLE" },
      recordedBy: { name: "Tidak dicatat" } }];
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(html).toContain("Pembayaran hutang manual");
    expect(html).toContain("ATK");
    expect(html).not.toContain('aria-label="Aksi"');
    expect(html).toContain("Pembayaran hutang manual yang belum terhubung ke transfer");
  });

  it("menampilkan bagian kategori dan total transfer ketika kategori laporan dipilih", () => {
    state.expenseRows = [{ id: "transfer", applicantName: "Pemasok", category: "SUPPLIES", amount: 100_000,
      netAmount: 100_000, changeAmount: 0, occurredAt: "2026-11-02T00:00:00Z", description: "Transfer",
      source: { type: "MANUAL_TRANSFER_PURCHASE" }, reportCategoryAmounts: { "report:ATK": 30_000, "report:SPANDUK": 70_000 },
      recordedBy: { name: "Pengguna" } }];
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(html).toContain("ATK: Rp");
    expect(html).toContain("30.000");
    expect(html).toContain("Total transfer");
    expect(html).toContain("100.000");
  });

  it("menggunakan satu snapshot untuk nilai bersih dan grafik ketika ringkasan terpisah berbeda", () => {
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(state.cashFlowEnabled).toBe(true);
    expect(state.expenseEnabled).toBe(false);
    expect(state.incomeEnabled).toBe(false);
    expect(state.incomeMetricsOnly).toBe(false);
    expect(state.expenseMetricsOnly).toBe(false);
    expect(html).toContain("160.000");
    expect(html).toMatch(/pelunasan piutang manual/i);
    expect(html).toContain("Lihat cara perhitungan");
    expect(html).not.toContain("170.000");
    expect(state.chart).toMatchObject({ incomeDaily: [{ date: "2026-11-03", total: 190_000 }], expenseDaily: [{ date: "2026-11-10", total: 30_000 }] });
  });

  it("shows incomplete status instead of a fabricated zero and explains the chart", () => {
    state.incomplete = true;
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(html).toContain("Belum tersedia");
    expect(html).toMatch(/riwayat giro/i);
    expect(html).not.toContain("Perlengkapan · 100%");
    expect(state.chart).toMatchObject({ incomeDaily: [{ date: "2026-11-03", total: 190_000 }], expenseDaily: [{ date: "2026-11-10", total: 30_000 }] });
  });

  it("memakai angka yang sama pada kartu dan net meskipun cache terpisah berbeda", () => {
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(html).toContain("160.000");
    expect(html).toContain("190.000");
    expect(html).not.toContain("222.222");
    expect(html).not.toContain("111.111");
  });

  it("keeps expense data but shows no income, net or chart for expense-only users", () => {
    state.incomePermission = false;
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(state.incomeEnabled).toBe(false);
    expect(state.expenseEnabled).toBe(true);
    expect(state.cashFlowEnabled).toBe(false);
    expect(state.expenseMetricsOnly).toBe(false);
    expect(html).not.toContain("111.111");
    expect(html).toContain("30.000");
    expect(html).not.toContain("222.222");
    expect(html).not.toContain("200.000");
    expect(html).not.toContain("190.000");
    expect(html).not.toContain("160.000");
    expect(html).toContain("Tidak memiliki akses pemasukan");
    expect(html).not.toContain("Belum ada pemasukan bulan ini");
    expect(state.chart).toBeNull();
  });

  it("keeps income data but shows no expense or net for income-only users", () => {
    state.expensePermission = false;
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(state.incomeEnabled).toBe(true);
    expect(state.expenseEnabled).toBe(false);
    expect(state.cashFlowEnabled).toBe(false);
    expect(state.incomeMetricsOnly).toBe(false);
    expect(html).not.toContain("222.222");
    expect(html).toContain("200.000");
    expect(html).not.toContain("111.111");
    expect(html).not.toContain("30.000");
    expect(html).not.toContain("190.000");
    expect(html).not.toContain("160.000");
    expect(html).toContain("Tidak memiliki akses pengeluaran");
    expect(state.chart).toBeNull();
  });

  it("keeps the daily entries when a separate income request has a stale error", () => {
    state.incomeError = true;
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(html).toContain("190.000");
    expect(html).toContain("2 trx");
    expect(html).not.toContain("Belum ada pemasukan bulan ini");
    expect(html).toContain("160.000");
    expect(state.chart).not.toBeNull();
  });

  it("hides a cached combined snapshot when the request fails", () => {
    state.cashFlowError = true;
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(html).toContain("Belum tersedia");
    expect(html).toContain("Grafik belum tersedia");
    expect(html).not.toContain("190.000");
    expect(html).not.toContain("160.000");
    expect(state.chart).toBeNull();
  });

  it("shows a loading state until the combined snapshot is available", () => {
    state.cashFlowLoading = true;
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(html).not.toContain("160.000");
    expect(state.chart).toMatchObject({ loading: true });
  });
});
