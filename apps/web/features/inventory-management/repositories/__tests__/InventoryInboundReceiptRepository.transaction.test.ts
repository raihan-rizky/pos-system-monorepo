import { describe, expect, it, vi } from "vitest";

const transactionMock = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", () => ({
  db: { $transaction: transactionMock },
  Prisma: {},
}));

import { InventoryInboundReceiptRepository } from "../InventoryInboundReceiptRepository";

describe("InventoryInboundReceiptRepository transaction timeout", () => {
  it("allows enough time for inbound receipt transactions", async () => {
    const tx = {};
    transactionMock.mockImplementation(async (callback) => callback(tx));
    const repository = new InventoryInboundReceiptRepository();

    await repository.runInTransaction(async (transaction) => transaction);

    expect(transactionMock).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 60_000,
    });
  });
});
