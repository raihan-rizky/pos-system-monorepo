import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), transactions: vi.fn(), manual: vi.fn(), income: vi.fn(), report: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.user, handleAuthError: () => null }));
vi.mock("@pos/db", () => ({ db: { transaction: { findMany: mocks.transactions }, manualIncome: { findMany: mocks.manual } } }));
vi.mock("@/features/financial-report/services/monthly-report", () => ({ getMonthlyFinancialReport: mocks.report }));
vi.mock("@/features/financial-report/services/daily-income", () => ({ loadIncomePeriod: mocks.income }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { GET } from "../summary/route";
describe("ringkasan pemasukan Keuangan", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "owner", storeId: "store-1" });
    mocks.transactions.mockResolvedValue([{ createdAt: new Date("2026-11-09T03:00:00Z"), total: 100_000 }]);
    mocks.manual.mockResolvedValue([{ id: "m", occurredAt: new Date("2026-11-11T03:00:00Z"), amount: 20_000 }]);
    mocks.report.mockResolvedValue({ income: [] });
    mocks.income.mockResolvedValue({ days: [{ date: "2026-11-10", total: 40_000 }, { date: "2026-11-11", total: 80_000 }] });
  });
  it("memakai penerimaan Sales untuk total dan mempertahankan jumlah nota", async () => {
    const body = await (await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11&metricsOnly=1"))).json();
    expect(body.monthlyTotal).toBe(120_000); expect(body.transactionCount).toBe(1); expect(body.manualEntryCount).toBe(1);
    expect(body.daily).toEqual(expect.arrayContaining([expect.objectContaining({ date: "2026-11-10", total: 40_000 }), expect.objectContaining({ date: "2026-11-11", total: 80_000 })]));
    expect(body.cashDaily).toBeUndefined();
  });
  it("mempertahankan respons cashTotal dan cashDaily pada mode lengkap", async () => {
    const body = await (await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11"))).json();
    expect(body.cashTotal).toBe(120_000); expect(body.cashDaily).toEqual([{ date: "2026-11-10", total: 40_000 }, { date: "2026-11-11", total: 80_000 }]);
  });
  it("menjumlahkan pecahan rupiah tanpa selisih pembulatan", async () => {
    mocks.income.mockResolvedValue({ days: [{ date: "2026-11-10", total: 0.1 }, { date: "2026-11-11", total: 0.2 }] });
    const body = await (await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11"))).json();
    expect(body.monthlyTotal).toBe(0.3);
    expect(body.cashTotal).toBe(0.3);
  });

  it("mempertahankan pelunasan piutang manual pada rincian arus kas lengkap", async () => {
    mocks.report.mockResolvedValue({ income: [{ id: "manual:r:p", date: "2026-11-11", amounts: { UNMAPPED: 50.01 } }] });
    const body = await (await GET(new Request("http://localhost/api/finance/income/summary?month=2026-11"))).json();
    expect(body.monthlyTotal).toBe(120_000);
    expect(body.cashTotal).toBe(120_050.01);
    expect(body.cashDaily).toEqual([{ date: "2026-11-10", total: 40_000 }, { date: "2026-11-11", total: 80_050.01 }]);
  });

});
