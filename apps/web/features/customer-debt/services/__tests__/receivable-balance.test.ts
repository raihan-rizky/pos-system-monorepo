import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transactionFindMany: vi.fn(),
  receivableFindMany: vi.fn(),
}));

vi.mock("@pos/db", () => ({
  db: {
    transaction: { findMany: mocks.transactionFindMany },
    customerReceivable: { findMany: mocks.receivableFindMany },
  },
}));

import { loadReceivableBalance } from "../receivable-balance";

describe("loadReceivableBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transactionFindMany.mockResolvedValue([
      { status: "COMPLETED", paymentMethod: "TEMPO", total: 300000, amountPaid: 100000 },
    ]);
    mocks.receivableFindMany.mockResolvedValue([
      { amount: 200000, amountPaid: 50000 },
    ]);
  });

  it("loads only the requested store through the Jakarta as-of date", async () => {
    await expect(loadReceivableBalance("store-1", "2026-11-11")).resolves.toBe(350000);

    expect(mocks.transactionFindMany).toHaveBeenCalledWith({
      where: {
        storeId: "store-1",
        status: "COMPLETED",
        paymentMethod: "TEMPO",
        invoiceDate: { lt: new Date("2026-11-12T00:00:00+07:00") },
      },
      select: { status: true, paymentMethod: true, total: true, amountPaid: true },
    });
    expect(mocks.receivableFindMany).toHaveBeenCalledWith({
      where: { storeId: "store-1", debtDate: { lte: new Date("2026-11-11T00:00:00Z") } },
      select: { amount: true, amountPaid: true },
    });
  });

  it("uses current paid amounts without reconstructing payment history", async () => {
    mocks.transactionFindMany.mockResolvedValue([
      { status: "COMPLETED", paymentMethod: "TEMPO", total: 300000, amountPaid: 160000 },
    ]);
    mocks.receivableFindMany.mockResolvedValue([
      { amount: 200000, amountPaid: 75000 },
    ]);

    await expect(loadReceivableBalance("store-1", "2026-11-11")).resolves.toBe(265000);
    expect(mocks.transactionFindMany.mock.calls[0][0].select).not.toHaveProperty("payments");
    expect(mocks.receivableFindMany.mock.calls[0][0].select).not.toHaveProperty("payments");
  });

  it("rejects an invalid as-of date before querying", async () => {
    await expect(loadReceivableBalance("store-1", "2026-02-30")).rejects.toThrow(RangeError);
    expect(mocks.transactionFindMany).not.toHaveBeenCalled();
    expect(mocks.receivableFindMany).not.toHaveBeenCalled();
  });
});
