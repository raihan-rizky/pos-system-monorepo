import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), income: vi.fn(), expenses: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@/features/financial-report/services/daily-income", () => ({ loadIncomePeriod: mocks.income }));
vi.mock("@/features/keuangan/services/recognized-finance", () => ({ loadRecognizedExpenses: mocks.expenses }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { GET } from "../route";

const request = (month = "2026-11") => new Request(`http://localhost/api/finance/cash-flow/summary?month=${month}`);

describe("combined cash-flow summary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T00:00:00Z"));
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    mocks.authError.mockReturnValue(null);
    mocks.expenses.mockResolvedValue({ monthlyTotal: 45_000, incomplete: false, daily: [
      { date: "2026-11-04", total: 10_000 }, { date: "2026-11-05", total: 5_000 }, { date: "2026-11-10", total: 30_000 },
    ], components: { manual: 10_000, transfer: 5_000, giroPayment: 30_000, giroDue: 0, overpayment: 0 } });
    mocks.income.mockResolvedValue({ days: [{ date: "2026-11-02", total: 170_000 }, { date: "2026-11-03", total: 30_000 }] });
  });
  afterEach(() => vi.useRealTimers());

  it("uses recognized expenses for the cash-flow total", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.permission.mock.calls).toEqual([["income", "read"], ["expense", "read"]]);
    expect(await response.json()).toMatchObject({
      month: "2026-11",
      income: { total: 200_000, daily: [{ date: "2026-11-02", total: 170_000 }, { date: "2026-11-03", total: 30_000 }] },
      expense: { total: 45_000, incomplete: false, components: { manual: 10_000, transfer: 5_000, giroPayment: 30_000, giroDue: 0, overpayment: 0 }, daily: [
        { date: "2026-11-04", total: 10_000 }, { date: "2026-11-05", total: 5_000 }, { date: "2026-11-10", total: 30_000 },
      ] },
    });
  });

  it("keeps known daily payments while marking incomplete cash unavailable", async () => {
    mocks.expenses.mockResolvedValueOnce({ monthlyTotal: null, incomplete: true, daily: [{ date: "2026-11-04", total: 10_000 }],
      components: { manual: 10_000, transfer: 0, giroPayment: 0, giroDue: 0, overpayment: 0 } });
    const response = await GET(request());
    expect((await response.json()).expense).toEqual({ total: null, incomplete: true, daily: [{ date: "2026-11-04", total: 10_000 }],
      components: { manual: 10_000, transfer: 0, giroPayment: 0, giroDue: 0, overpayment: 0 } });
  });

  it("uses the recognized daily breakdown from the shared projection", async () => {
    mocks.expenses.mockResolvedValueOnce({ monthlyTotal: 30_000, incomplete: false, daily: [
      { date: "2026-11-04", total: 10_000 }, { date: "2026-11-06", total: 3_000 }, { date: "2026-11-11", total: 17_000 },
    ], components: { manual: 10_000, transfer: 3_000, giroPayment: 17_000, giroDue: 0, overpayment: 0 } });
    const response = await GET(request());
    expect((await response.json()).expense).toEqual({ total: 30_000, incomplete: false,
      components: { manual: 10_000, transfer: 3_000, giroPayment: 17_000, giroDue: 0, overpayment: 0 }, daily: [
      { date: "2026-11-04", total: 10_000 }, { date: "2026-11-06", total: 3_000 }, { date: "2026-11-11", total: 17_000 },
    ] });
  });

  it.each(["income", "expense"])("rejects callers without %s permission before reading data", async (denied) => {
    mocks.permission.mockImplementation(async (resource: string) => {
      if (resource === denied) throw new Error("forbidden");
      return { id: "user-1", storeId: "store-1" };
    });
    mocks.authError.mockReturnValue(new Response(null, { status: 403 }));
    expect((await GET(request())).status).toBe(403);
  });

  it.each([
    [{ id: "user-1", storeId: null }, { id: "user-1", storeId: null }],
    [{ id: "", storeId: "store-1" }, { id: "", storeId: "store-1" }],
    [{ id: "user-1", storeId: "store-1" }, { id: "user-2", storeId: "store-1" }],
    [{ id: "user-1", storeId: "store-1" }, { id: "user-1", storeId: "store-2" }],
  ])("rejects missing or inconsistent identities before reading data", async (first, second) => {
    mocks.permission.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    expect((await GET(request())).status).toBe(403);
  });

  it.each(["2026-13", "2026-1", "2026-12", "1899-12"])("rejects invalid or future month %s", async (month) => {
    expect((await GET(request(month))).status).toBe(422);
  });

  it("uses the Jakarta calendar at a month boundary when no month is supplied", async () => {
    vi.setSystemTime(new Date("2026-11-30T17:01:00Z"));
    const response = await GET(new Request("http://localhost/api/finance/cash-flow/summary"));
    expect(response.status).toBe(200);
    expect((await response.json()).month).toBe("2026-12");
  });

  it("returns an error if the income period cannot be read", async () => {
    mocks.income.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await GET(request())).status).toBe(500);
  });
});
