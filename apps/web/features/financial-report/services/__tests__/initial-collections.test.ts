import { describe, expect, it, vi } from "vitest";
import { findInitialCollections } from "../initial-collections";

describe("findInitialCollections", () => {
  it("loads all-time settlement amounts before the report filters collection dates", async () => {
    const bounds = { gte: new Date("2026-10-05T17:00:00Z"), lt: new Date("2026-10-06T17:00:00Z") };
    const findMany = vi.fn().mockResolvedValue([{
      id: "tx-tax", createdAt: new Date("2026-10-06T03:00:00Z"), status: "COMPLETED", paymentMethod: "CASH",
      total: "110000", amountPaid: "110000", change: "0", salesName: null, salesperson: null,
      payments: [{ method: "CASH", amount: "150000", createdAt: new Date("2026-10-06T03:00:00Z") }],
      debtPaymentLogs: [{ id: "next-day-settlement", amount: "10000", paymentMethod: "TRANSFER", createdAt: new Date("2026-10-07T03:00:00Z") }],
    }]);
    const client = { transaction: { findMany } } as unknown as Parameters<typeof findInitialCollections>[0];
    const rows = await findInitialCollections(client, "store-1", bounds);

    // Debt amounts must remain unfiltered even when their receipt falls outside
    // this report day; otherwise cumulative header payments become initial cash.
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: "store-1",
        OR: expect.arrayContaining([{ debtPaymentLogs: { some: { createdAt: bounds } } }]),
      }),
      select: expect.objectContaining({
        payments: {
          select: { method: true, amount: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
        debtPaymentLogs: {
          select: { id: true, amount: true, paymentMethod: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      }),
    }));
    expect(rows[0]).toMatchObject({
      total: 110000, amountPaid: 110000, change: 0,
      payments: [{ method: "CASH", amount: 150000 }],
      debtPaymentLogs: [{ id: "next-day-settlement", amount: 10000 }],
    });
  });
});
