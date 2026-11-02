import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), transactions: vi.fn(), manualIncome: vi.fn(), report: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { transaction: { findMany: mocks.transactions }, manualIncome: { findMany: mocks.manualIncome } } }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@/features/financial-report/services/monthly-report", () => ({ getMonthlyFinancialReport: mocks.report }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { GET } from "../summary/route";

describe("income cash summary permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    mocks.authError.mockReturnValue(null);
    mocks.transactions.mockResolvedValue([{ createdAt: new Date("2026-11-01T02:00:00Z"), total: 500_000 }]);
    mocks.manualIncome.mockResolvedValue([]);
    mocks.report.mockResolvedValue({ income: [
      { date: "2026-11-02", amounts: { CETAK: 100_000.25, ATK: 50_000 } },
      { date: "2026-11-02", amounts: { UNMAPPED: 20_000 } },
      { date: "2026-11-05", amounts: { CETAK: 30_000 } },
    ], expenses: [{ date: "2026-11-08", amount: 41_000 }] });
  });

  it("keeps transaction metrics and adds workbook cash income without expense details", async () => {
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11"));
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith("income", "read");
    expect(mocks.report).toHaveBeenCalledWith("store-1", 2026, 11);
    const body = await response.json();
    expect(body.monthlyTotal).toBe(500_000);
    expect(body.transactionCount).toBe(1);
    expect(body.daily).toHaveLength(1);
    expect(body.cashTotal).toBe(200_000.25);
    expect(body.cashDaily).toEqual([{ date: "2026-11-02", total: 170_000.25 }, { date: "2026-11-05", total: 30_000 }]);
    expect(JSON.stringify(body)).not.toContain("2026-11-08");
    expect(JSON.stringify(body)).not.toContain("41000");
  });

  it("returns transaction metrics without computing a cash report when explicitly requested", async () => {
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11&metricsOnly=1"));
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith("income", "read");
    expect(mocks.transactions).toHaveBeenCalledOnce();
    expect(mocks.report).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body).toMatchObject({ month: "2026-11", monthlyTotal: 500_000, transactionCount: 1 });
    expect(body).not.toHaveProperty("cashDaily");
    expect(body).not.toHaveProperty("cashTotal");
  });

  it.each(["1899-12", "9999-01"])("rejects an unavailable report period in metrics mode: %s", async month => {
    const response = await GET(new Request(`http://localhost/api/finance/income/summary?month=${month}&metricsOnly=1`));
    expect(response.status).not.toBe(200);
    expect(mocks.report).not.toHaveBeenCalled();
    expect(mocks.transactions).not.toHaveBeenCalled();
  });

  it("enforces income permission before reading metrics", async () => {
    mocks.permission.mockRejectedValue(new Error("forbidden"));
    mocks.authError.mockReturnValue(new Response(null, { status: 403 }));
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11&metricsOnly=1"));
    expect(response.status).toBe(403);
    expect(mocks.transactions).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("rejects expense-only callers before reading income", async () => {
    mocks.permission.mockRejectedValue(new Error("forbidden"));
    mocks.authError.mockReturnValue(new Response(null, { status: 403 }));
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11"));
    expect(response.status).toBe(403);
    expect(mocks.transactions).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("rejects a user without a store before reading income", async () => {
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: null });
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11"));
    expect(response.status).toBe(403);
    expect(mocks.transactions).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });
});
