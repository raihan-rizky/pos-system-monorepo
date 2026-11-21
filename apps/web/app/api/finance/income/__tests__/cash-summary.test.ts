import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), report: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@/features/financial-report/services/daily-income", () => ({ loadMonthlyIncome: mocks.report }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { GET } from "../summary/route";

describe("income cash summary permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    mocks.authError.mockReturnValue(null);
    mocks.report.mockResolvedValue({
      total: 200_000.25, transactionCount: 1, manualEntryCount: 0,
      daily: [{ date: "2026-11-02", total: 170_000.25 }, { date: "2026-11-05", total: 30_000 }],
      components: { sales: 180_000.25, manualReceivable: 20_000, manualIncome: 0 },
      supplierRefund: 0,
    });
  });

  it("keeps monthly and daily cash totals consistent without expense details", async () => {
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11"));
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith("income", "read");
    expect(mocks.report).toHaveBeenCalledWith("store-1", "2026-11", expect.any(Date));
    const body = await response.json();
    expect(body.monthlyTotal).toBe(200_000.25);
    expect(body.transactionCount).toBe(1);
    expect(body.daily).toEqual(body.cashDaily);
    expect(body.cashTotal).toBe(200_000.25);
    expect(body.cashDaily).toEqual([{ date: "2026-11-02", total: 170_000.25 }, { date: "2026-11-05", total: 30_000 }]);
    expect(JSON.stringify(body)).not.toContain("2026-11-08");
    expect(JSON.stringify(body)).not.toContain("41000");
  });

  it("returns the same recognized total in metrics mode", async () => {
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11&metricsOnly=1"));
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith("income", "read");
    expect(mocks.report).toHaveBeenCalledOnce();
    const body = await response.json();
    expect(body).toMatchObject({ month: "2026-11", monthlyTotal: 200_000.25, transactionCount: 1 });
    expect(body).not.toHaveProperty("cashDaily");
    expect(body).not.toHaveProperty("cashTotal");
  });

  it.each(["1899-12", "9999-01"])("rejects an unavailable report period in metrics mode: %s", async month => {
    const response = await GET(new Request(`http://localhost/api/finance/income/summary?month=${month}&metricsOnly=1`));
    expect(response.status).not.toBe(200);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("enforces income permission before reading metrics", async () => {
    mocks.permission.mockRejectedValue(new Error("forbidden"));
    mocks.authError.mockReturnValue(new Response(null, { status: 403 }));
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11&metricsOnly=1"));
    expect(response.status).toBe(403);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("rejects expense-only callers before reading income", async () => {
    mocks.permission.mockRejectedValue(new Error("forbidden"));
    mocks.authError.mockReturnValue(new Response(null, { status: 403 }));
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11"));
    expect(response.status).toBe(403);
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("rejects a user without a store before reading income", async () => {
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: null });
    const response = await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11"));
    expect(response.status).toBe(403);
    expect(mocks.report).not.toHaveBeenCalled();
  });
});
