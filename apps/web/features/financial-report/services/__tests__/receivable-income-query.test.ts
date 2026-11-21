import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transactions: vi.fn(), manual: vi.fn(), receivables: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { $queryRaw: async () => [],
  transaction: { findMany: mocks.transactions },
  manualIncome: { findMany: mocks.manual },
  customerReceivable: { findMany: mocks.receivables },
} }));
import { loadIncomePeriod } from "../daily-income";

describe("pemuatan pembayaran piutang manual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transactions.mockResolvedValue([]);
    mocks.manual.mockResolvedValue([]);
    mocks.receivables.mockResolvedValue([{ id: "r1", amount: 25, reportCategory: null, payments: [
      { id: "p1", method: "CASH", amount: 25, paidAt: null, createdAt: new Date("2026-11-11T04:00:00Z") },
    ] }]);
  });

  it("membatasi pembayaran berdasarkan toko dan rentang penerimaan WIB", async () => {
    const result = await loadIncomePeriod("store-1", "2026-11-10", "2026-11-11");
    expect(result.days.map(day => day.total)).toEqual([0, 25]);
    expect(result.contributions).toEqual([expect.objectContaining({ receivablePaymentId: "p1", receivableId: "r1", date: "2026-11-11", amount: 25 })]);
    expect(mocks.receivables).toHaveBeenCalledOnce();
    expect(mocks.receivables.mock.calls[0][0].where).toMatchObject({ storeId: "store-1", payments: { some: { OR: [
      { paidAt: { gte: new Date("2026-11-10T00:00:00Z"), lte: new Date("2026-11-11T00:00:00Z") } },
      { paidAt: null, createdAt: { gte: new Date("2026-11-09T17:00:00Z"), lt: new Date("2026-11-11T17:00:00Z") } },
    ] } } });
  });
});
