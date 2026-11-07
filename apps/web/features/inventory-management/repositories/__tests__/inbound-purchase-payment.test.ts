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
    paymentDueDate: null, payments: [], expense: null, _count: { items: 1 }, ...overrides,
  };
  return {
    goodsPurchase: { findFirst: vi.fn().mockResolvedValue(purchase), update: vi.fn().mockResolvedValue({}) },
    expense: { create: vi.fn().mockResolvedValue({}) },
    supplierPayable: { create: vi.fn().mockResolvedValue({}) },
    goodsPurchasePayment: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
  };
}

describe("purchase payment at receipt finalization", () => {
  const schedule = [
    { method: "GIRO" as const, amount: 30_000, dueDate: "2026-11-14", note: null },
    { method: "GIRO" as const, amount: 46_000, dueDate: "2026-12-07", note: null },
  ];

  it("creates a single verified payable for only the giro portion of a mixed schedule", async () => {
    const tx = transaction();
    await new InventoryInboundReceiptRepository().settleGoodsPurchasePayment(tx as never, {
      ...input, paymentMethod: null, paymentDueDate: null,
      payments: [
        { method: "TRANSFER", amount: 16_000, dueDate: null },
        { method: "GIRO", amount: 20_000, dueDate: "2026-11-30" },
        { method: "GIRO", amount: 40_000, dueDate: "2026-11-07" },
      ],
    });
    expect(tx.expense.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 76_000 }) }));
    expect(tx.supplierPayable.create).toHaveBeenCalledTimes(1);
    expect(tx.supplierPayable.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      goodsPurchaseId: "purchase-1", amount: 60_000,
      dueDate: new Date("2026-11-07T00:00:00Z"), giroHistoryVerifiedAt: now,
    }) }));
  });

  it("keeps transfer-only schedules free of supplier giro debt", async () => {
    const tx = transaction();
    await new InventoryInboundReceiptRepository().settleGoodsPurchasePayment(tx as never, {
      ...input, paymentMethod: "TRANSFER", paymentDueDate: null,
      payments: [{ method: "TRANSFER", amount: 76_000, dueDate: null }],
    });
    expect(tx.supplierPayable.create).not.toHaveBeenCalled();
  });

  it("does not recreate a payable when another receipt uses an approved mixed schedule", async () => {
    const payments = [
      { method: "TRANSFER" as const, amount: 16_000, dueDate: null, note: null },
      { method: "GIRO" as const, amount: 60_000, dueDate: new Date("2026-11-07T00:00:00Z"), note: null },
    ];
    const tx = transaction({ payments, expense: { id: "expense-1" } });
    await new InventoryInboundReceiptRepository().settleGoodsPurchasePayment(tx as never, {
      ...input, paymentMethod: null, paymentDueDate: null,
      payments: payments.map(row => ({ ...row, dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null })),
    });
    expect(tx.supplierPayable.create).not.toHaveBeenCalled();
    expect(tx.expense.create).not.toHaveBeenCalled();
  });

  it("persists two giro rows only at approval and creates one full expense", async () => {
    const tx = transaction();
    await new InventoryInboundReceiptRepository().settleGoodsPurchasePayment(tx as never, {
      ...input, paymentMethod: null, paymentDueDate: null, payments: schedule,
    });
    expect(tx.goodsPurchasePayment.createMany).toHaveBeenCalledWith({ data: schedule.map(payment => ({
      ...payment, goodsPurchaseId: "purchase-1", createdById: "owner-1", dueDate: new Date(`${payment.dueDate}T00:00:00Z`),
    })) });
    expect(tx.expense.create).toHaveBeenCalledTimes(1);
    expect(tx.expense.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 76_000 }) }));
  });

  it("rejects a different schedule after another receipt established payment", async () => {
    const tx = transaction({ payments: schedule.map(p => ({ ...p, amount: String(p.amount), dueDate: new Date(`${p.dueDate}T00:00:00Z`) })), expense: { id: "expense-1" } });
    await expect(new InventoryInboundReceiptRepository().settleGoodsPurchasePayment(tx as never, {
      ...input, paymentMethod: null, paymentDueDate: null,
      payments: [{ method: "TRANSFER", amount: 76_000, dueDate: null }],
    })).rejects.toThrow(/pembayaran.*berubah/i);
    expect(tx.goodsPurchasePayment.createMany).not.toHaveBeenCalled();
  });

  it("rejects a legacy single-giro proposal after multi-giro terms were approved", async () => {
    const tx = transaction({ paymentMethod: "GIRO", paymentDueDate: input.paymentDueDate,
      payments: schedule.map(row => ({ ...row, amount: String(row.amount), dueDate: new Date(`${row.dueDate}T00:00:00Z`) })), expense: { id: "expense-1" },
    });
    await expect(new InventoryInboundReceiptRepository().settleGoodsPurchasePayment(tx as never, input))
      .rejects.toThrow(/pembayaran.*berubah/i);
    expect(tx.expense.create).not.toHaveBeenCalled();
  });

  it("submission saves a proposal on the receipt without changing the purchase", async () => {
    let saved: Record<string, unknown> | undefined;
    const tx = {
      inventoryInboundReceipt: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { saved = data; return { id: "receipt-1", status: "SUBMITTED" }; }) },
    };
    await new InventoryInboundReceiptRepository().createSubmittedGoodsPurchaseReceipt(tx as never, {
      storeId: "store-1", goodsPurchaseId: "purchase-1", shoppingRequestId: "shopping-1", supplierId: null,
      paymentMethod: null, paymentDueDate: null,
      payments: schedule.map(p => ({ ...p, dueDate: new Date(`${p.dueDate}T00:00:00Z`) })),
      submittedBy: "inventory-1", submittedAt: now, note: null, lines: [],
    });
    expect(saved?.paymentSchedule).toEqual(schedule);
  });
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
