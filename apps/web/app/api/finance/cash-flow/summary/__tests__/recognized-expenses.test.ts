import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), income: vi.fn(), expenses: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: () => null }));
vi.mock("@/features/financial-report/services/monthly-report", () => ({ getMonthlyFinancialReport: mocks.income }));
vi.mock("@/features/keuangan/services/recognized-finance", () => ({ loadRecognizedExpenses: mocks.expenses }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { GET } from "../route";

describe("ringkasan arus kas berdasarkan pengeluaran yang diakui", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ id: "owner", storeId: "store-1" });
    mocks.income.mockResolvedValue({ income: [
      { id: "sale:payment", date: "2026-11-10", amounts: { ATK: 80_000 } },
      { id: "manual-income:1", date: "2026-11-10", amounts: { ATK: 20_000 } },
      { id: "manual:receivable:payment", date: "2026-11-10", amounts: { UNMAPPED: 30_000 } },
    ] });
    mocks.expenses.mockResolvedValue({
      monthlyTotal: 30_000, incomplete: false,
      daily: [{ date: "2026-11-10", total: 30_000 }],
      components: { manual: 20_000, transfer: 0, giroPayment: 0, giroDue: 10_000, overpayment: 0 },
    });
  });

  it("menggunakan pelunasan piutang manual dan sisa giro jatuh tempo dalam total", async () => {
    const response = await GET(new Request("http://localhost/api/finance/cash-flow/summary?month=2026-11"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.income.total).toBe(130_000);
    expect(body.income.components).toEqual({ sales: 80_000, manualIncome: 20_000, manualReceivable: 30_000 });
    expect(body.income.daily).toMatchObject([{ date: "2026-11-10", total: 130_000, manualReceivable: 30_000 }]);
    expect(body.expense).toMatchObject({
      total: 30_000,
      incomplete: false,
      daily: [{ date: "2026-11-10", total: 30_000 }],
      components: { manual: 20_000, giroDue: 10_000 },
    });
    expect(body.income.total - body.expense.total).toBe(100_000);
  });

  it("menghitung pembayaran yang sudah keluar dan refund berdasarkan tanggal masing-masing", async () => {
    const base = await mocks.income();
    mocks.income.mockResolvedValueOnce({ income: [...base.income,
      { id: "supplier-refund:2026-11-20", date: "2026-11-20", amounts: { UNMAPPED: 800_000 } },
    ] });
    mocks.expenses.mockResolvedValueOnce({
      monthlyTotal: 30_000, incomplete: false,
      daily: [{ date: "2026-11-10", total: 30_000 }],
      components: { manual: 20_000, transfer: 0, giroPayment: 0, giroDue: 10_000, overpayment: 0 },
      correctionCash: {
        outflow: [{ date: "2026-11-10", total: 800_000 }],
        refunds: [{ date: "2026-11-20", total: 800_000 }],
      },
    });
    const response = await GET(new Request("http://localhost/api/finance/cash-flow/summary?month=2026-11"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.expense).toMatchObject({
      total: 830_000, daily: [{ date: "2026-11-10", total: 830_000 }], correctionOutflow: 800_000,
    });
    expect(body.income).toMatchObject({
      total: 930_000, supplierRefund: 800_000,
      daily: [{ date: "2026-11-10", total: 130_000 }, { date: "2026-11-20", total: 800_000 }],
    });
  });
});
