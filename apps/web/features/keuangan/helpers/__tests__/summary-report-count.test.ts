import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), income: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: () => null }));
vi.mock("@/features/financial-report/services/daily-income", () => ({ loadMonthlyIncome: mocks.income }));
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
    mocks.income.mockResolvedValue({ total: 100_000, daily: [{ date: "2026-11-03", total: 100_000 }] });
  });

  it("uses the same projections for separate summaries and the combined dashboard", async () => {
    const [incomeResponse, expenseResponse, cashResponse] = await Promise.all([
      income(new Request("http://localhost/api/finance/income/summary?month=2026-11&metricsOnly=1")),
      expense(new Request("http://localhost/api/finance/expenses/summary?month=2026-11&metricsOnly=1")),
      combined(new Request("http://localhost/api/finance/cash-flow/summary?month=2026-11")),
    ]);
    expect([incomeResponse.status, expenseResponse.status, cashResponse.status]).toEqual([200, 200, 200]);
    expect(mocks.income).toHaveBeenCalledTimes(2);
    expect(mocks.income).toHaveBeenCalledWith("store-1", "2026-11", expect.any(Date));
    const cash = await cashResponse.json();
    expect(await incomeResponse.json()).toMatchObject({ monthlyTotal: cash.income.total, daily: cash.income.daily });
    expect(await expenseResponse.json()).toMatchObject({ monthlyTotal: cash.expense.total, daily: cash.expense.daily });
  });
});
