import { beforeEach, describe, expect, it, vi } from "vitest";

const runTransaction = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", () => ({ db: { $transaction: runTransaction } }));
import { addBackdatedPurchasePayment } from "../backdated-purchase-repository";

describe("pengakuan ulang pembayaran belanja terdahulu", () => {
  beforeEach(() => vi.clearAllMocks());

  it("memindahkan pengakuan ke tanggal pembayaran historis tanpa mencatat ulang pembayaran setelah jatuh tempo", async () => {
    const date = (value: string) => new Date(`${value}T00:00:00Z`);
    const row = {
      id: "purchase-1", storeId: "store-1", purchaseDate: date("2026-10-15"), dueDate: date("2026-11-10"),
      paymentMethod: "GIRO", reference: "GIRO-123", amount: "10000000.00", createdById: "user-1",
      requestId: "purchase-request", requestFingerprint: "fingerprint", createdAt: date("2026-11-01"),
      payments: [
        { id: "early-1", purchaseId: "purchase-1", requestId: "early-1", amount: "4000000.00", paidAt: date("2026-10-30"), createdAt: date("2026-11-01"), createdById: "user-1" },
        { id: "early-2", purchaseId: "purchase-1", requestId: "early-2", amount: "2000000.00", paidAt: date("2026-11-02"), createdAt: date("2026-11-02"), createdById: "user-1" },
      ],
    };
    const expenses = new Map<string, { amount: string; occurredAt: Date; deletedAt: Date | null }>([
      ["payment:early-1", { amount: "4000000.00", occurredAt: new Date("2026-10-29T17:00:00Z"), deletedAt: null }],
      ["payment:early-2", { amount: "2000000.00", occurredAt: new Date("2026-11-01T17:00:00Z"), deletedAt: null }],
      ["due:purchase-1", { amount: "4000000.00", occurredAt: new Date("2026-11-09T17:00:00Z"), deletedAt: null }],
    ]);
    let sequence = 0;
    const tx = {
      $queryRaw: async () => [{ id: row.id }],
      backdatedPurchase: { findFirst: async () => ({ ...row, payments: [...row.payments] }) },
      backdatedPurchasePayment: { create: async ({ data }: { data: Omit<(typeof row.payments)[number], "id" | "createdAt"> }) => {
        const payment = { ...data, id: `new-${++sequence}`, createdAt: date("2026-12-15") };
        row.payments.push(payment);
        return payment;
      } },
      expense: {
        upsert: async ({ where, create, update }: { where: { backdatedPurchasePaymentId?: string; backdatedPurchaseDueId?: string }; create: { amount: string; occurredAt: Date }; update: { amount: string; occurredAt: Date; deletedAt: null } }) => {
          const key = where.backdatedPurchasePaymentId ? `payment:${where.backdatedPurchasePaymentId}` : `due:${where.backdatedPurchaseDueId}`;
          expenses.set(key, expenses.has(key) ? update : { amount: create.amount, occurredAt: create.occurredAt, deletedAt: null });
        },
        updateMany: async ({ where, data }: { where: { backdatedPurchaseDueId: string }; data: { deletedAt: Date } }) => {
          const key = `due:${where.backdatedPurchaseDueId}`;
          const existing = expenses.get(key);
          if (existing) expenses.set(key, { ...existing, deletedAt: data.deletedAt });
        },
      },
    };
    runTransaction.mockImplementation(async (callback) => callback(tx));
    const actor = { id: "user-1", storeId: "store-1" };

    const late = await addBackdatedPurchasePayment("purchase-1", { requestId: "late", amountCents: 200_000_000, paidAt: "2026-12-02" }, actor);
    expect(late).toMatchObject({ paidCents: 800_000_000, remainingCents: 200_000_000, paymentStatus: "PARTIAL" });
    expect(expenses.has("payment:new-1")).toBe(false);
    expect(expenses.get("due:purchase-1")?.amount).toBe("4000000.00");

    const recordedLater = await addBackdatedPurchasePayment("purchase-1", { requestId: "historical", amountCents: 100_000_000, paidAt: "2026-11-10" }, actor);
    expect(recordedLater).toMatchObject({ paidCents: 900_000_000, remainingCents: 100_000_000, paymentStatus: "PARTIAL" });
    expect(expenses.get("payment:new-2")).toEqual({ amount: "1000000.00", occurredAt: new Date("2026-11-09T17:00:00Z"), deletedAt: null });
    expect(expenses.get("due:purchase-1")).toEqual({ amount: "3000000.00", occurredAt: new Date("2026-11-09T17:00:00Z"), deletedAt: null });
    expect([...expenses.values()].reduce((sum, expense) => sum + Number(expense.amount), 0)).toBe(10_000_000);
  });
});
