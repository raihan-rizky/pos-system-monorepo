import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  incomplete: false, incomePermission: true, expensePermission: true,
  incomeError: false, expenseError: false, chart: null as unknown,
  incomeEnabled: null as unknown, expenseEnabled: null as unknown,
  incomeMetricsOnly: null as unknown, expenseMetricsOnly: null as unknown,
  cashFlowEnabled: null as unknown, cashFlowError: false, cashFlowLoading: false,
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
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ canAccess: () => true, canPerform: (resource: string, action: string) => action === "read" ? (resource === "income" ? state.incomePermission : state.expensePermission) : false }) }));
vi.mock("@/features/ai-assistant/hooks/useAssistantModalAction", () => ({ useAssistantModalAction: () => {} }));
vi.mock("@/features/keuangan/components/SupplierPayablesPanel", () => ({ SupplierPayablesPanel: () => null }));
vi.mock("@/features/keuangan/components/DeferredCashFlowChart", () => ({ DeferredCashFlowChart: (props: unknown) => { state.chart = props; return null; } }));
vi.mock("@/features/keuangan/hooks/useKeuangan", () => ({
  useCashFlowSummary: (_month: string, enabled: boolean) => {
    state.cashFlowEnabled = enabled;
    return { isLoading: state.cashFlowLoading, isError: state.cashFlowError, data: {
      income: { total: 190_000, daily: [{ date: "2026-11-03", total: 190_000 }] },
      expense: { total: state.incomplete ? null : 30_000, incomplete: state.incomplete, daily: [{ date: "2026-11-10", total: 30_000 }] },
    } };
  },
  // Deliberately keep cached data after permissions change: it must not appear in the UI.
  useIncomeSummary: (_month: string, enabled: boolean, metricsOnly: boolean) => {
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
  useExpenseList: () => ({ isLoading: false, isError: false, data: { data: [], pagination: { total: 0, totalPages: 0, page: 1 } } }),
  useCustomExpenseCategories: () => ({ data: { data: [] }, isError: false }),
}));
import KeuanganDashboardPage from "@/app/(main)/keuangan/page";

describe("ringkasan arus kas Keuangan", () => {
  beforeEach(() => Object.assign(state, { incomplete: false, incomePermission: true, expensePermission: true, incomeError: false, expenseError: false, cashFlowError: false, cashFlowLoading: false, cashFlowEnabled: null, chart: null }));

  it("menggunakan satu snapshot untuk nilai bersih dan grafik ketika ringkasan terpisah berbeda", () => {
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(state.cashFlowEnabled).toBe(true);
    expect(state.incomeMetricsOnly).toBe(true);
    expect(state.expenseMetricsOnly).toBe(true);
    expect(html).toContain("160.000");
    expect(html).toContain("termasuk pelunasan piutang manual");
    expect(html).not.toContain("170.000");
    expect(state.chart).toMatchObject({ incomeDaily: [{ date: "2026-11-03", total: 190_000 }], expenseDaily: [{ date: "2026-11-10", total: 30_000 }] });
  });

  it("shows incomplete status instead of a fabricated zero and explains the chart", () => {
    state.incomplete = true;
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(html).toContain("Belum tersedia");
    expect(html).toMatch(/riwayat giro/i);
    expect(state.chart).toMatchObject({ incomeDaily: [{ date: "2026-11-03", total: 190_000 }], expenseDaily: [{ date: "2026-11-10", total: 30_000 }] });
  });

  it("calculates the cash net from permitted workbook cash aggregates", () => {
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(html).toContain("160.000");
    expect(html).toContain("222.222"); // legacy transaction total remains intact
  });

  it("keeps expense data but shows no income, net or chart for expense-only users", () => {
    state.incomePermission = false;
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(state.incomeEnabled).toBe(false);
    expect(state.expenseEnabled).toBe(true);
    expect(state.cashFlowEnabled).toBe(false);
    expect(state.expenseMetricsOnly).toBe(false);
    expect(html).toContain("111.111");
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
    expect(html).toContain("222.222");
    expect(html).toContain("200.000");
    expect(html).not.toContain("111.111");
    expect(html).not.toContain("30.000");
    expect(html).not.toContain("190.000");
    expect(html).not.toContain("160.000");
    expect(html).toContain("Tidak memiliki akses pengeluaran");
    expect(state.chart).toBeNull();
  });

  it("shows a separate income error while keeping the combined snapshot", () => {
    state.incomeError = true;
    const html = renderToStaticMarkup(<KeuanganDashboardPage />);
    expect(html).toContain("Pemasukan belum tersedia");
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
