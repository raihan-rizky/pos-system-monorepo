import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), income: vi.fn(), expenses: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: () => null }));
vi.mock("@/features/financial-report/services/daily-income", () => ({ loadIncomePeriod: mocks.income }));
vi.mock("@/features/keuangan/services/recognized-finance", () => ({ loadRecognizedExpenses: mocks.expenses }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { GET } from "../route";

describe("penyelarasan arus kas dengan Sales", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ id: "owner", storeId: "store-1" });
    mocks.expenses.mockResolvedValue({ monthlyTotal: 30_000, incomplete: false, daily: [{ date: "2026-11-11", total: 30_000 }],
      components: { manual: 25_000, transfer: 5_000, giroPayment: 0, giroDue: 0, overpayment: 0 } });
    mocks.income.mockResolvedValue({ days: [{ date: "2026-11-10", total: 40_000 }, { date: "2026-11-11", total: 80_000 }] });
  });
  it("memakai penerimaan Sales dan mempertahankan pembayaran pengeluaran yang sudah tersedia", async () => {
    const response = await GET(new Request("http://localhost/api/finance/cash-flow/summary?month=2026-11"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.income).toMatchObject({ total: 120_000, daily: [{ date: "2026-11-10", total: 40_000 }, { date: "2026-11-11", total: 80_000 }] });
    expect(body.expense).toEqual({ total: 30_000, incomplete: false, daily: [{ date: "2026-11-11", total: 30_000 }],
      components: { manual: 25_000, transfer: 5_000, giroPayment: 0, giroDue: 0, overpayment: 0 } });
  });
  it("mempertahankan pelunasan piutang manual di arus kas tanpa menggandakan transaksi", async () => {
    mocks.income.mockResolvedValue({
      days: [{ date: "2026-11-10", total: 40_000 }, { date: "2026-11-11", total: 80_050.01 }],
      contributions: [
        { id: "sale-1", date: "2026-11-10", source: "transaction", amount: 40_000 },
        { id: "sale-2", date: "2026-11-11", source: "transaction", amount: 80_000 },
        { id: "receivable:payment-1", date: "2026-11-11", source: "manual-receivable", amount: 50.01 },
      ],
    });
    const body = await (await GET(new Request("http://localhost/api/finance/cash-flow/summary?month=2026-11"))).json();
    expect(body.income).toMatchObject({ total: 120_050.01, daily: [{ date: "2026-11-10", total: 40_000 }, { date: "2026-11-11", total: 80_050.01 }] });
  });

});
