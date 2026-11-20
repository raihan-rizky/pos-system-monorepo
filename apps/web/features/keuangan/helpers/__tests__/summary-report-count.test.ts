import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), report: vi.fn(), transaction: vi.fn(), expense: vi.fn(), manualIncome: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { transaction: { findMany: mocks.transaction }, expense: { findMany: mocks.expense }, manualIncome: { findMany: mocks.manualIncome } } }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: () => null }));
vi.mock("@/features/financial-report/services/monthly-report", () => ({ getMonthlyFinancialReport: mocks.report }));
vi.mock("@/features/keuangan/services/recognized-finance", () => ({ loadRecognizedExpenses: async () => ({
  monthlyTotal: 45_000, incomplete: false, entryCount: 3,
  daily: [{ date: "2026-11-01", total: 10_000 }, { date: "2026-11-05", total: 5_000 }, { date: "2026-11-10", total: 30_000 }],
  byCategory: [{ category: "SUPPLIES", total: 45_000 }],
  components: { manual: 10_000, transfer: 5_000, giroPayment: 30_000, giroDue: 0, overpayment: 0 },
}) }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

import { GET as income } from "@/app/api/finance/income/summary/route";
import { GET as expense } from "@/app/api/finance/expenses/summary/route";
import { GET as combined } from "@/app/api/finance/cash-flow/summary/route";

describe("finance dashboard report count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    mocks.transaction.mockResolvedValue([]);
    mocks.expense.mockResolvedValue([]);
    mocks.manualIncome.mockResolvedValue([]);
    mocks.report.mockResolvedValue({
      income: [{ date: "2026-11-03", amounts: { CETAK: 100_000 } }],
      expenses: [{ date: "2026-11-01", amount: 10_000 }],
      purchaseExpenses: [{ date: "2026-11-05", amount: 5_000, purchase: { method: "TRANSFER" } }],
      giroPayments: [{ date: "2026-11-10", amount: 30_000 }],
      cashIncomplete: false,
    });
  });

  it("uses one monthly report for three dashboard requests and the recognized expense projection", async () => {
    const [incomeResponse, expenseResponse, cashResponse] = await Promise.all([
      income(new Request("http://localhost/api/finance/income/summary?month=2026-11&metricsOnly=1")),
      expense(new Request("http://localhost/api/finance/expenses/summary?month=2026-11&metricsOnly=1")),
      combined(new Request("http://localhost/api/finance/cash-flow/summary?month=2026-11")),
    ]);
    expect([incomeResponse.status, expenseResponse.status, cashResponse.status]).toEqual([200, 200, 200]);
    expect(mocks.report).toHaveBeenCalledExactlyOnceWith("store-1", 2026, 11);
    expect((await cashResponse.json()).expense.total).toBe(45_000);
    expect(await incomeResponse.json()).not.toHaveProperty("cashTotal");
    expect(await expenseResponse.json()).not.toHaveProperty("cashExpense");
  });
});
