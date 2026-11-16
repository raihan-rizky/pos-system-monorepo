import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transactions: vi.fn(), manual: vi.fn(), receivablePayments: vi.fn() }));
vi.mock("@pos/db", () => ({ db: {
  transaction: { findMany: mocks.transactions },
  manualIncome: { findMany: mocks.manual },
  customerReceivablePayment: { findMany: mocks.receivablePayments },
} }));
import { loadIncomePeriod } from "../daily-income";

describe("pemuatan pembayaran piutang manual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transactions.mockResolvedValue([]);
    mocks.manual.mockResolvedValue([]);
    mocks.receivablePayments.mockResolvedValue([{ id: "p1", receivableId: "r1", method: "CASH", amount: 25, createdAt: new Date("2026-11-11T04:00:00Z") }]);
  });

  it("membatasi pembayaran berdasarkan toko dan rentang penerimaan WIB", async () => {
    const result = await loadIncomePeriod("store-1", "2026-11-10", "2026-11-11");
    expect(result.days.map(day => day.total)).toEqual([0, 25]);
    expect(mocks.receivablePayments).toHaveBeenCalledOnce();
    expect(mocks.receivablePayments.mock.calls[0][0].where).toMatchObject({
      receivable: { storeId: "store-1" },
      createdAt: { gte: new Date("2026-11-09T17:00:00Z"), lt: new Date("2026-11-11T17:00:00Z") },
    });
  });
});
