import { beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", () => ({ db: { $transaction: transaction } }));

import { addBackdatedPurchasePayment } from "../backdated-purchase-repository";

const actor = { id: "user-1", name: "Admin", storeId: "store-1" };
const row = {
  id: "purchase-1",
  storeId: "store-1",
  purchaseDate: new Date("2026-10-15T00:00:00.000Z"),
  dueDate: new Date("2026-11-10T00:00:00.000Z"),
  paymentMethod: "GIRO",
  reference: "GIRO-123",
  amount: "10000000.00",
  requestId: "purchase-request",
  requestFingerprint: "fingerprint",
  createdAt: new Date("2026-11-01T00:00:00.000Z"),
  payments: [],
};

function makeTransaction(purchase: typeof row | null = row) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(purchase ? [{ id: purchase.id }] : []),
    backdatedPurchase: { findFirst: vi.fn().mockResolvedValue(purchase) },
    backdatedPurchasePayment: {
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: "payment-1",
        ...data,
        createdAt: new Date("2026-11-01T00:00:00.000Z"),
      })),
    },
    expense: {
      upsert: vi.fn().mockResolvedValue({ id: "expense-1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe("addBackdatedPurchasePayment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records a payment before the due date and updates the linked due expense", async () => {
    const tx = makeTransaction();
    transaction.mockImplementationOnce((callback) => callback(tx));

    const result = await addBackdatedPurchasePayment("purchase-1", {
      requestId: "payment-request",
      amountCents: 400_000_000,
      paidAt: "2026-10-30",
    }, actor);

    expect(result).toMatchObject({ paidCents: 400_000_000, remainingCents: 600_000_000, paymentStatus: "PARTIAL" });
    expect(tx.expense.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { backdatedPurchasePaymentId: "payment-1" },
      create: expect.objectContaining({ amount: "4000000.00" }),
    }));
    expect(tx.expense.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { backdatedPurchaseDueId: "purchase-1" },
      create: expect.objectContaining({ amount: "6000000.00" }),
      update: expect.objectContaining({ amount: "6000000.00" }),
    }));
  });

  it("does not create another expense for a payment after the due date", async () => {
    const tx = makeTransaction();
    transaction.mockImplementationOnce((callback) => callback(tx));

    const result = await addBackdatedPurchasePayment("purchase-1", {
      requestId: "late-payment",
      amountCents: 200_000_000,
      paidAt: "2026-12-02",
    }, actor);

    expect(result.remainingCents).toBe(800_000_000);
    expect(tx.expense.upsert).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { backdatedPurchasePaymentId: "payment-1" },
    }));
    expect(tx.expense.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { backdatedPurchaseDueId: "purchase-1" },
      update: expect.objectContaining({ amount: "10000000.00" }),
    }));
  });

  it("returns the existing payment on retry and rejects reusing its key for different data", async () => {
    const existing = {
      id: "payment-1", purchaseId: "purchase-1", requestId: "retry-key", amount: "10000000.00",
      paidAt: new Date("2026-11-10T00:00:00.000Z"), createdById: "user-1", createdAt: row.createdAt,
    };
    const tx = makeTransaction({ ...row, payments: [existing] } as unknown as typeof row);
    transaction.mockImplementation((callback) => callback(tx));

    await expect(addBackdatedPurchasePayment("purchase-1", {
      requestId: "retry-key", amountCents: 1_000_000_000, paidAt: "2026-11-10",
    }, actor)).resolves.toMatchObject({ remainingCents: 0, paymentStatus: "PAID" });
    expect(tx.backdatedPurchasePayment.create).not.toHaveBeenCalled();
    await expect(addBackdatedPurchasePayment("purchase-1", {
      requestId: "retry-key", amountCents: 100, paidAt: "2026-11-10",
    }, actor)).rejects.toMatchObject({ status: 409 });
  });

  it("rejects an overpayment and a purchase outside the actor's store", async () => {
    const tx = makeTransaction();
    transaction.mockImplementationOnce((callback) => callback(tx));
    await expect(addBackdatedPurchasePayment("purchase-1", {
      requestId: "too-much", amountCents: 1_000_000_001, paidAt: "2026-11-10",
    }, actor)).rejects.toMatchObject({ status: 422 });
    expect(tx.backdatedPurchasePayment.create).not.toHaveBeenCalled();

    const missing = makeTransaction(null);
    transaction.mockImplementationOnce((callback) => callback(missing));
    await expect(addBackdatedPurchasePayment("other-store", {
      requestId: "other", amountCents: 100, paidAt: "2026-11-10",
    }, actor)).rejects.toMatchObject({ status: 404 });
  });
});
