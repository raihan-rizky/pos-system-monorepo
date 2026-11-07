import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), expense: vi.fn(), report: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { expense: { findMany: mocks.expense } } }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@/features/financial-report/services/monthly-report", () => ({ getMonthlyFinancialReport: mocks.report }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { GET } from "../summary/route";

const fixture = () => ({
  income: [{ id: "sale", date: "2026-11-03", amounts: { CETAK: 200_000, ATK: 0 } }],
  expenses: [{ id: "manual", date: "2026-11-01", amount: 10_000, group: "OTHER" }],
  purchaseExpenses: [
    { id: "giro", date: "2026-11-15", amount: 100_000, group: "OTHER", purchase: { method: "GIRO" } },
    { id: "transfer", date: "2026-11-05", amount: 5_000, group: "OTHER", purchase: { method: "TRANSFER" } },
  ],
  giroPayments: [{ id: "paid", date: "2026-11-10", amount: 30_000, group: "OTHER" }],
  cashIncomplete: false,
});

describe("expense cash summary permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    mocks.authError.mockReturnValue(null);
    mocks.expense.mockResolvedValue([]);
    mocks.report.mockResolvedValue(fixture());
  });

  it("returns expense metrics with expense read only, without exposing income values or dates", async () => {
    const response = await GET(new Request("http://localhost/api/finance/expenses/summary?month=2026-11"));
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith("expense", "read");
    expect(mocks.report).toHaveBeenCalledWith("store-1", 2026, 11);
    const body = await response.json();
    expect(body.monthlyTotal).toBe(0);
    expect(body.cashExpense).toEqual({ total: 45_000, incomplete: false });
    expect(body.cashDaily).toEqual([
      { date: "2026-11-01", total: 10_000 },
      { date: "2026-11-05", total: 5_000 },
      { date: "2026-11-10", total: 30_000 },
    ]);
    expect(JSON.stringify(body)).not.toContain("2026-11-03");
    expect(JSON.stringify(body)).not.toContain("200000");
    expect(body).not.toHaveProperty("netCashFlow");
  });

  it("returns expense metrics without computing a cash report when explicitly requested", async () => {
    const response = await GET(new Request("http://localhost/api/finance/expenses/summary?month=2026-11&metricsOnly=1"));
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith("expense", "read");
    expect(mocks.expense).toHaveBeenCalledOnce();
    expect(mocks.report).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body).toMatchObject({ month: "2026-11", monthlyTotal: 0, entryCount: 0, byCategory: [], daily: [] });
    expect(body).not.toHaveProperty("cashDaily");
    expect(body).not.toHaveProperty("cashExpense");
  });

  it("uses actual purchase payments without counting corrected totals or giro rows again", async () => {
    mocks.report.mockResolvedValue({
      ...fixture(),
      purchasePayments: [{ date: "2026-11-06", amount: 3_000 }, { date: "2026-11-11", amount: 17_000 }],
    });
    const response = await GET(new Request("http://localhost/api/finance/expenses/summary?month=2026-11"));
    const body = await response.json();
    expect(body.cashExpense).toEqual({ total: 30_000, incomplete: false });
    expect(body.cashDaily).toEqual([
      { date: "2026-11-01", total: 10_000 }, { date: "2026-11-06", total: 3_000 }, { date: "2026-11-11", total: 17_000 },
    ]);
  });

  it.each(["1899-12", "9999-01"])("rejects an unavailable report period in metrics mode: %s", async month => {
    const response = await GET(new Request(`http://localhost/api/finance/expenses/summary?month=${month}&metricsOnly=1`));
    expect(response.status).not.toBe(200);
    expect(mocks.report).not.toHaveBeenCalled();
    expect(mocks.expense).not.toHaveBeenCalled();
  });

  it("enforces expense permission before reading metrics", async () => {
    mocks.permission.mockRejectedValue(new Error("forbidden"));
    mocks.authError.mockReturnValue(new Response(null, { status: 403 }));
    const response = await GET(new Request("http://localhost/api/finance/expenses/summary?month=2026-11&metricsOnly=1"));
    expect(response.status).toBe(403);
    expect(mocks.expense).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("marks the cash expense total unavailable when giro history is incomplete", async () => {
    mocks.report.mockResolvedValue({ ...fixture(), cashIncomplete: true });
    const response = await GET(new Request("http://localhost/api/finance/expenses/summary?month=2026-11"));
    const body = await response.json();
    expect(body.cashExpense).toEqual({ total: null, incomplete: true });
    expect(body.cashDaily.find((day: { date: string }) => day.date === "2026-11-10").total).toBe(30_000);
  });

  it("groups custom categories separately from the default Lainnya category", async () => {
    mocks.expense.mockResolvedValue([
      { occurredAt: new Date("2026-11-03T03:00:00Z"), amount: 100, changeAmount: 0, category: "OTHER", customCategoryId: "cat-1" },
      { occurredAt: new Date("2026-11-03T03:00:00Z"), amount: 40, changeAmount: 0, category: "OTHER", customCategoryId: null },
    ]);
    const response = await GET(new Request("http://localhost/api/finance/expenses/summary?month=2026-11"));
    const body = await response.json();
    expect(mocks.expense.mock.calls[0][0].select.customCategoryId).toBe(true);
    expect(body.byCategory).toEqual(expect.arrayContaining([{ category: "custom:cat-1", total: 100 }, { category: "OTHER", total: 40 }]));
    expect(body.daily[0].byCategory).toMatchObject({ "custom:cat-1": 100, OTHER: 40 });
  });

  it("does not read expense data without expense permission", async () => {
    mocks.permission.mockRejectedValue(new Error("forbidden"));
    mocks.authError.mockReturnValue(new Response(null, { status: 403 }));
    const response = await GET(new Request("http://localhost/api/finance/expenses/summary?month=2026-11"));
    expect(response.status).toBe(403);
    expect(mocks.expense).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("rejects a user without a store before reading expenses", async () => {
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: null });
    const response = await GET(new Request("http://localhost/api/finance/expenses/summary?month=2026-11"));
    expect(response.status).toBe(403);
    expect(mocks.expense).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });
});
