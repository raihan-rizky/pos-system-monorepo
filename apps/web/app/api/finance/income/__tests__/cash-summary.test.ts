import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), transactions: vi.fn(), manualIncome: vi.fn(), income: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { transaction: { findMany: mocks.transactions }, manualIncome: { findMany: mocks.manualIncome } } }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@/features/financial-report/services/daily-income", () => ({ loadIncomePeriod: mocks.income }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { GET } from "../summary/route";

describe("income cash summary permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    mocks.authError.mockReturnValue(null);
    mocks.transactions.mockResolvedValue([{ createdAt: new Date("2026-11-01T02:00:00Z"), total: 500_000 }]);
    mocks.manualIncome.mockResolvedValue([]);
    mocks.income.mockResolvedValue({
      days: [{ date: "2026-11-02", total: 170_000.25 }, { date: "2026-11-05", total: 30_000 }],
      contributions: [
        { date: "2026-11-02", source: "transaction", transactionId: "nota-1", amount: 170_000.25 },
        { date: "2026-11-05", source: "transaction", transactionId: "nota-1", amount: 30_000 },
      ],
    });
  });

  it("uses the shared receipt ledger for cash income without reading expense details", async () => {
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11"));
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith("income", "read");
    const body = await response.json();
    expect(body.monthlyTotal).toBe(200_000.25);
    expect(body.transactionCount).toBe(1);
    expect(body.daily).toHaveLength(2);
    expect(body.cashTotal).toBe(200_000.25);
    expect(body.cashDaily).toMatchObject([{ date: "2026-11-02", total: 170_000.25 }, { date: "2026-11-05", total: 30_000 }]);
    expect(JSON.stringify(body)).not.toContain("2026-11-08");
    expect(JSON.stringify(body)).not.toContain("41000");
  });

  it("returns the same recognized total in metrics mode", async () => {
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11&metricsOnly=1"));
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith("income", "read");
    expect(mocks.transactions).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body).toMatchObject({ month: "2026-11", monthlyTotal: 200_000.25, transactionCount: 1 });
    expect(body).not.toHaveProperty("cashDaily");
    expect(body).not.toHaveProperty("cashTotal");
  });

  it("counts a nota on each receipt day and once across the month", async () => {
    mocks.income.mockResolvedValue({
      days: [{ date: "2026-11-02", total: 50 }, { date: "2026-11-05", total: 100 }],
      contributions: [
        { date: "2026-11-02", source: "transaction", transactionId: "an-older-nota", amount: 50 },
        { date: "2026-11-05", source: "transaction", transactionId: "an-older-nota", amount: 75 },
        { date: "2026-11-05", source: "transaction", transactionId: "an-older-nota", amount: 25 },
      ],
    });
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.transactionCount).toBe(1);
    expect(body.daily).toMatchObject([
      { date: "2026-11-02", count: 1, total: 50 },
      { date: "2026-11-05", count: 1, total: 100 },
    ]);
    expect(body.cashDaily).toEqual(body.daily);
    expect(mocks.transactions).not.toHaveBeenCalled();
  });

  it.each(["1899-12", "9999-01"])("rejects an unavailable report period in metrics mode: %s", async month => {
    const response = await GET(new Request(`http://localhost/api/finance/income/summary?month=${month}&metricsOnly=1`));
    expect(response.status).toBe(422);
    expect(mocks.transactions).not.toHaveBeenCalled();
  });

  it("enforces income permission before reading metrics", async () => {
    mocks.permission.mockRejectedValue(new Error("forbidden"));
    mocks.authError.mockReturnValue(new Response(null, { status: 403 }));
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11&metricsOnly=1"));
    expect(response.status).toBe(403);
    expect(mocks.transactions).not.toHaveBeenCalled();
  });

  it("rejects expense-only callers before reading income", async () => {
    mocks.permission.mockRejectedValue(new Error("forbidden"));
    mocks.authError.mockReturnValue(new Response(null, { status: 403 }));
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11"));
    expect(response.status).toBe(403);
    expect(mocks.transactions).not.toHaveBeenCalled();
  });
  it("rejects a user without a store before reading income", async () => {
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: null });
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11"));
    expect(response.status).toBe(403);
    expect(mocks.transactions).not.toHaveBeenCalled();
  });
});
