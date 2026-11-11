import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), report: vi.fn(), income: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: () => null }));
vi.mock("@/features/financial-report/services/monthly-report", () => ({ getMonthlyFinancialReport: mocks.report }));
vi.mock("@/features/financial-report/services/daily-income", () => ({ loadIncomePeriod: mocks.income }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { GET } from "../route";

describe("penyelarasan arus kas dengan Sales", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ id: "owner", storeId: "store-1" });
    mocks.report.mockResolvedValue({ income: [{ date: "2026-11-10", amounts: { ATK: 999 } }], expenses: [{ date: "2026-11-11", amount: 25_000 }], purchasePayments: [{ date: "2026-11-11", amount: 5_000 }], cashIncomplete: false });
    mocks.income.mockResolvedValue({ days: [{ date: "2026-11-10", total: 40_000 }, { date: "2026-11-11", total: 80_000 }] });
  });
  it("memakai penerimaan Sales dan mempertahankan pembayaran pengeluaran yang sudah tersedia", async () => {
    const response = await GET(new Request("http://localhost/api/finance/cash-flow/summary?month=2026-11"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.income).toEqual({ total: 120_000, daily: [{ date: "2026-11-10", total: 40_000 }, { date: "2026-11-11", total: 80_000 }] });
    expect(body.expense).toEqual({ total: 30_000, incomplete: false, daily: [{ date: "2026-11-11", total: 30_000 }] });
  });
  it("mempertahankan pelunasan piutang manual di arus kas tanpa menggandakan transaksi", async () => {
    mocks.report.mockResolvedValue({ income: [
      { id: "manual:r1:p1", date: "2026-11-11", amounts: { UNMAPPED: 50.01 } },
      { id: "sale:p1", date: "2026-11-11", amounts: { ATK: 80_000 } },
    ], expenses: [], purchasePayments: [], cashIncomplete: false });
    const body = await (await GET(new Request("http://localhost/api/finance/cash-flow/summary?month=2026-11"))).json();
    expect(body.income).toEqual({ total: 120_050.01, daily: [{ date: "2026-11-10", total: 40_000 }, { date: "2026-11-11", total: 80_050.01 }] });
  });

});
