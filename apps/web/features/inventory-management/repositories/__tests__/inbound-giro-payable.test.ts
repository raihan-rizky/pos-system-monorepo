import { describe, expect, it } from "vitest";
import { InventoryInboundReceiptRepository } from "../InventoryInboundReceiptRepository";

type Purchase = {
  id: string;
  number: string;
  shoppingRequestId: string;
  supplierNameSnapshot: string;
  totalAmount: number;
  paymentMethod: "GIRO" | "TRANSFER" | null;
  paymentDueDate: Date | null;
  payments: Array<{ method: "TRANSFER" | "GIRO"; amount: number; dueDate: Date | null; note: string | null }>;
  expense: { id: string } | null;
  shoppingRequest: { expense: { id: string } | null };
  _count: { items: number };
};

function fakeTransaction(overrides: Partial<Purchase> = {}) {
  const purchase: Purchase = {
    id: "purchase-1",
    number: "PB-001",
    shoppingRequestId: "shopping-1",
    supplierNameSnapshot: "Pemasok Contoh",
    totalAmount: 76_000,
    paymentMethod: null,
    paymentDueDate: null,
    payments: [],
    expense: null,
    shoppingRequest: { expense: null },
    _count: { items: 1 },
    ...overrides,
  };
  const payables: Record<string, unknown>[] = [];
  const expenses: Record<string, unknown>[] = [];
  const tx = {
    shoppingRequestCorrection: { count: async () => 0 },
    goodsPurchase: {
      findFirst: async () => purchase,
      update: async ({ data }: { data: Pick<Purchase, "paymentMethod" | "paymentDueDate"> }) => {
        Object.assign(purchase, data);
      },
    },
    expense: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        expenses.push(data);
        purchase.expense = { id: "expense-1" };
      },
    },
    supplierPayable: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        payables.push(data);
      },
    },
  };
  return { tx, purchase, payables, expenses };
}

describe("giro payable on first received purchase", () => {
  it("creates one known payable with the WIB receipt date, even after a retry", async () => {
    const fixture = fakeTransaction();
    const input = {
      storeId: "store-1",
      goodsPurchaseId: "purchase-1",
      paymentMethod: "GIRO" as const,
      paymentDueDate: new Date("2026-11-15T00:00:00.000Z"),
      actor: { id: "owner-1" },
      now: new Date("2026-10-31T18:00:00.000Z"),
    };
    const repository = new InventoryInboundReceiptRepository();
    await repository.settleGoodsPurchasePayment(fixture.tx as never, input);
    await repository.settleGoodsPurchasePayment(fixture.tx as never, input);

    expect(fixture.expenses).toHaveLength(1);
    expect(fixture.payables).toHaveLength(1);
    expect(fixture.payables[0]).toMatchObject({
      storeId: "store-1",
      goodsPurchaseId: "purchase-1",
      supplierName: "Pemasok Contoh",
      amount: 76_000,
      debtDate: new Date("2026-11-01T00:00:00.000Z"),
      dueDate: input.paymentDueDate,
      createdById: "owner-1",
      giroHistoryVerifiedAt: input.now,
    });
  });

  it("does not create a giro payable for a transfer", async () => {
    const fixture = fakeTransaction();
    await new InventoryInboundReceiptRepository().settleGoodsPurchasePayment(fixture.tx as never, {
      storeId: "store-1",
      goodsPurchaseId: "purchase-1",
      paymentMethod: "TRANSFER",
      paymentDueDate: null,
      actor: { id: "owner-1" },
      now: new Date("2026-11-01T08:00:00.000Z"),
    });

    expect(fixture.expenses).toHaveLength(1);
    expect(fixture.payables).toEqual([]);
  });

  it("does not invent a known payment history for an existing purchase expense", async () => {
    const dueDate = new Date("2026-11-15T00:00:00.000Z");
    const fixture = fakeTransaction({
      paymentMethod: "GIRO",
      paymentDueDate: dueDate,
      expense: { id: "old-expense" },
    });
    await new InventoryInboundReceiptRepository().settleGoodsPurchasePayment(fixture.tx as never, {
      storeId: "store-1",
      goodsPurchaseId: "purchase-1",
      paymentMethod: "GIRO",
      paymentDueDate: dueDate,
      actor: { id: "owner-1" },
      now: new Date("2026-11-01T08:00:00.000Z"),
    });

    expect(fixture.expenses).toEqual([]);
    expect(fixture.payables).toEqual([]);
  });
});
