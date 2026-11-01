import { describe, expect, it, vi } from "vitest";
import { InventoryInboundReceiptRepository } from "../InventoryInboundReceiptRepository";

const now = new Date("2026-10-31T08:00:00.000Z");
const input = {
  storeId: "store-1",
  goodsPurchaseId: "purchase-1",
  paymentMethod: "GIRO" as const,
  paymentDueDate: new Date("2026-11-02T00:00:00.000Z"),
  actor: { id: "owner-1", name: "Owner" },
  now,
};

function transaction(overrides: Record<string, unknown> = {}) {
  const purchase = {
    id: "purchase-1", number: "PB-001", shoppingRequestId: "shopping-1",
    supplierNameSnapshot: "Pemasok", totalAmount: 76000, paymentMethod: null,
    paymentDueDate: null, expense: null, _count: { items: 1 }, ...overrides,
  };
  return {
    goodsPurchase: { findFirst: vi.fn().mockResolvedValue(purchase), update: vi.fn().mockResolvedValue({}) },
    expense: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe("purchase payment at receipt finalization", () => {
  it("records the full purchase amount once when the first receipt is approved", async () => {
    const repository = new InventoryInboundReceiptRepository() as unknown as {
      settleGoodsPurchasePayment?: (tx: unknown, args: typeof input) => Promise<void>;
    };
    expect(repository.settleGoodsPurchasePayment).toBeTypeOf("function");
    const tx = transaction();
    await repository.settleGoodsPurchasePayment!(tx, input);
    expect(tx.goodsPurchase.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentMethod: "GIRO", paymentDueDate: input.paymentDueDate }),
    }));
    expect(tx.expense.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: 76000, goodsPurchaseId: "purchase-1", occurredAt: now }),
    }));
  });

  it("does not duplicate a historical expense", async () => {
    const repository = new InventoryInboundReceiptRepository() as unknown as {
      settleGoodsPurchasePayment: (tx: unknown, args: typeof input) => Promise<void>;
    };
    const tx = transaction({ paymentMethod: "GIRO", paymentDueDate: input.paymentDueDate, expense: { id: "expense-1" } });
    await repository.settleGoodsPurchasePayment(tx, input);
    expect(tx.expense.create).not.toHaveBeenCalled();
  });

  it("preserves a historical expense linked only to the shopping request", async () => {
    const repository = new InventoryInboundReceiptRepository() as unknown as {
      settleGoodsPurchasePayment: (tx: unknown, args: typeof input) => Promise<void>;
    };
    const tx = transaction({ shoppingRequest: { expense: { id: "old-expense" } } });
    await repository.settleGoodsPurchasePayment(tx, input);
    expect(tx.expense.create).not.toHaveBeenCalled();
  });

  it("rejects a receipt proposing a different method after another receipt was approved", async () => {
    const repository = new InventoryInboundReceiptRepository() as unknown as {
      settleGoodsPurchasePayment: (tx: unknown, args: typeof input) => Promise<void>;
    };
    const tx = transaction({ paymentMethod: "TRANSFER", expense: { id: "expense-1" } });
    await expect(repository.settleGoodsPurchasePayment(tx, input)).rejects.toThrow(/metode pembayaran/i);
    expect(tx.goodsPurchase.update).not.toHaveBeenCalled();
    expect(tx.expense.create).not.toHaveBeenCalled();
  });
});
