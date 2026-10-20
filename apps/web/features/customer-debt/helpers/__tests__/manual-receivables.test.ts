import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReceivableSchema, receivablePaymentSchema, createReceivable, payReceivable } from "../manual-receivables";

const input = { customerId: "customer-1", amount: 125000, debtDate: "2026-09-01", dueDate: "2026-10-01", clientMutationId: "9e70ff2c-9401-4edb-91a6-d0637ed226ad" };
const user = { id: "user-1", storeId: "store-1" };
function fixture() {
  const entry = { id: "debt-1", ...input, storeId: "store-1", amountPaid: 25000, note: null };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "customer-1" }]),
    customer: { findFirst: vi.fn().mockResolvedValue({ id: "customer-1" }), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    customerReceivable: { findFirst: vi.fn().mockResolvedValue(entry), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation(({ data }) => ({ id: "debt-1", ...data })), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    customerReceivablePayment: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "payment-1" }) },
    transaction: { create: vi.fn() },
  };
  return { tx, entry };
}
type Tx = Parameters<typeof createReceivable>[0];

describe("manual customer receivables", () => {
  beforeEach(() => { vi.useRealTimers(); });
  it("accepts old debt with its own dates and note", () => {
    expect(createReceivableSchema.safeParse({ ...input, note: "Saldo sebelum memakai POS" }).success).toBe(true);
  });
  it.each([
    { amount: 0 }, { amount: -1 }, { amount: Infinity }, { amount: 1.001 },
    { amount: 10000000000 }, { debtDate: "2026-02-30" }, { dueDate: "2026-13-01" },
    { dueDate: "2026-08-31" }, { debtDate: "2999-01-01", dueDate: "2999-01-02" },
    { clientMutationId: "" },
  ])("rejects invalid ledger input %j", (invalid) => {
    expect(createReceivableSchema.safeParse({ ...input, ...invalid }).success).toBe(false);
  });
  it("uses the Jakarta date boundary when validating the debt date", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-19T17:00:00Z"));
    expect(createReceivableSchema.safeParse({ ...input, debtDate: "2026-10-20", dueDate: "2026-10-20" }).success).toBe(true);
    expect(createReceivableSchema.safeParse({ ...input, debtDate: "2026-10-21", dueDate: "2026-10-21" }).success).toBe(false);
  });
  it("creates a ledger and increases debt without sales or order writes", async () => {
    const { tx } = fixture();
    await createReceivable(tx as unknown as Tx, createReceivableSchema.parse(input), user);
    expect(tx.customerReceivable.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 125000, customerId: "customer-1", storeId: "store-1", createdById: "user-1", debtDate: new Date("2026-09-01T00:00:00Z"), dueDate: new Date("2026-10-01T00:00:00Z") }) }));
    expect(tx.customer.update).toHaveBeenCalledWith({ where: { id: "customer-1" }, data: { totalDebt: { increment: 125000 } } });
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
  it("rejects a customer from another store before writing", async () => {
    const { tx } = fixture(); tx.customer.findFirst.mockResolvedValueOnce(null);
    await expect(createReceivable(tx as unknown as Tx, createReceivableSchema.parse(input), user)).rejects.toMatchObject({ status: 404 });
    expect(tx.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "customer-1", storeId: "store-1" } }));
    expect(tx.customerReceivable.create).not.toHaveBeenCalled();
  });
  it("returns an identical create retry without increasing debt twice", async () => {
    const { tx } = fixture(); tx.customerReceivable.findUnique.mockResolvedValueOnce({ ...input, storeId: "store-1", note: null, debtDate: new Date("2026-09-01"), dueDate: new Date("2026-10-01") } as never);
    await createReceivable(tx as unknown as Tx, createReceivableSchema.parse(input), user);
    expect(tx.customerReceivable.create).not.toHaveBeenCalled(); expect(tx.customer.update).not.toHaveBeenCalled();
  });
  it("rejects reusing a mutation id with changed customer or amount", async () => {
    const { tx } = fixture(); tx.customerReceivable.findUnique.mockResolvedValueOnce({ ...input, amount: 1, storeId: "store-1" } as never);
    await expect(createReceivable(tx as unknown as Tx, createReceivableSchema.parse(input), user)).rejects.toMatchObject({ status: 409 });
  });
  it("records a partial payment with a guarded balance and no sales increments", async () => {
    const { tx } = fixture();
    const payment = receivablePaymentSchema.parse({ amount: 50000, method: "TRANSFER", clientMutationId: input.clientMutationId, note: "Cicilan" });
    await payReceivable(tx as unknown as Tx, "debt-1", payment, user);
    expect(tx.customerReceivable.updateMany).toHaveBeenCalledWith({ where: { id: "debt-1", storeId: "store-1", amountPaid: 25000, amount: 125000 }, data: { amountPaid: { increment: 50000 } } });
    expect(tx.customerReceivablePayment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ receivableId: "debt-1", amount: 50000, method: "TRANSFER", createdById: "user-1" }) });
    expect(tx.customer.updateMany).toHaveBeenCalledWith({ where: { id: "customer-1", storeId: "store-1", totalDebt: { gte: 50000 } }, data: { totalDebt: { decrement: 50000 } } });
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });
  it("allows exact settlement and rejects overpayment", async () => {
    const { tx } = fixture();
    await payReceivable(tx as unknown as Tx, "debt-1", receivablePaymentSchema.parse({ amount: 100000, method: "CASH", clientMutationId: input.clientMutationId }), user);
    const over = fixture();
    await expect(payReceivable(over.tx as unknown as Tx, "debt-1", receivablePaymentSchema.parse({ amount: 100001, method: "CASH", clientMutationId: input.clientMutationId }), user)).rejects.toMatchObject({ status: 409 });
    expect(over.tx.customerReceivablePayment.create).not.toHaveBeenCalled();
  });
  it("rejects a stale concurrent payment without recording it", async () => {
    const { tx } = fixture(); tx.customerReceivable.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(payReceivable(tx as unknown as Tx, "debt-1", receivablePaymentSchema.parse({ amount: 1000, method: "CASH", clientMutationId: input.clientMutationId }), user)).rejects.toMatchObject({ status: 409 });
    expect(tx.customerReceivablePayment.create).not.toHaveBeenCalled();
  });
  it("does not decrement a customer or record a payment twice after an identical retry", async () => {
    const { tx } = fixture();
    tx.customerReceivablePayment.findUnique.mockResolvedValueOnce({ receivableId: "debt-1", amount: 1000, method: "CASH", note: null } as never);
    await payReceivable(tx as unknown as Tx, "debt-1", receivablePaymentSchema.parse({ amount: 1000, method: "CASH", clientMutationId: input.clientMutationId }), user);
    expect(tx.customerReceivable.updateMany).not.toHaveBeenCalled(); expect(tx.customer.updateMany).not.toHaveBeenCalled(); expect(tx.customerReceivablePayment.create).not.toHaveBeenCalled();
  });
  it("rejects payment mutation reuse for another amount before any balance writes", async () => {
    const { tx } = fixture();
    tx.customerReceivablePayment.findUnique.mockResolvedValueOnce({ receivableId: "debt-1", amount: 500, method: "CASH", note: null } as never);
    await expect(payReceivable(tx as unknown as Tx, "debt-1", receivablePaymentSchema.parse({ amount: 1000, method: "CASH", clientMutationId: input.clientMutationId }), user)).rejects.toMatchObject({ status: 409 });
    expect(tx.customerReceivable.updateMany).not.toHaveBeenCalled();
  });
  it("rejects a stale customer balance so the surrounding transaction can roll back", async () => {
    const { tx } = fixture(); tx.customer.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(payReceivable(tx as unknown as Tx, "debt-1", receivablePaymentSchema.parse({ amount: 1000, method: "CASH", clientMutationId: input.clientMutationId }), user)).rejects.toMatchObject({ status: 409 });
    expect(tx.customerReceivablePayment.create).not.toHaveBeenCalled();
  });
  it("does not expose or pay a debt from a different store", async () => {
    const { tx } = fixture(); tx.customerReceivable.findFirst.mockResolvedValueOnce(null);
    await expect(payReceivable(tx as unknown as Tx, "debt-1", receivablePaymentSchema.parse({ amount: 1000, method: "CASH", clientMutationId: input.clientMutationId }), user)).rejects.toMatchObject({ status: 404 });
    expect(tx.customerReceivable.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "debt-1", storeId: "store-1" } }));
    expect(tx.customerReceivable.updateMany).not.toHaveBeenCalled();
  });
  it("rejects non-cash settlement methods and fractional sub-cent amounts", () => {
    expect(receivablePaymentSchema.safeParse({ amount: 1000, method: "TEMPO", clientMutationId: input.clientMutationId }).success).toBe(false);
    expect(receivablePaymentSchema.safeParse({ amount: 0.001, method: "CASH", clientMutationId: input.clientMutationId }).success).toBe(false);
  });

  it.each([
    { customerId: "customer-2" },
    { storeId: "store-2" },
    { debtDate: new Date("2026-09-02T00:00:00Z") },
    { dueDate: new Date("2026-10-02T00:00:00Z") },
    { note: "Catatan berbeda" },
  ])("rejects a create mutation already used for different ledger data %j", async (changed) => {
    const { tx } = fixture();
    tx.customerReceivable.findUnique.mockResolvedValueOnce({
      ...input, storeId: user.storeId, note: null,
      debtDate: new Date("2026-09-01T00:00:00Z"),
      dueDate: new Date("2026-10-01T00:00:00Z"), ...changed,
    } as never);

    await expect(createReceivable(tx as unknown as Tx, createReceivableSchema.parse(input), user))
      .rejects.toMatchObject({ status: 409 });
    expect(tx.customerReceivable.create).not.toHaveBeenCalled();
    expect(tx.customer.update).not.toHaveBeenCalled();
  });

  it.each([
    { receivableId: "debt-other" },
    { method: "TRANSFER" },
    { note: "Catatan berbeda" },
  ])("rejects a payment mutation reused for different payment data %j", async (changed) => {
    const { tx } = fixture();
    tx.customerReceivablePayment.findUnique.mockResolvedValueOnce({
      receivableId: "debt-1", amount: 1000, method: "CASH", note: null, ...changed,
    } as never);

    await expect(payReceivable(tx as unknown as Tx, "debt-1", receivablePaymentSchema.parse({
      amount: 1000, method: "CASH", clientMutationId: input.clientMutationId,
    }), user)).rejects.toMatchObject({ status: 409 });
    expect(tx.customerReceivable.updateMany).not.toHaveBeenCalled();
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
    expect(tx.customerReceivablePayment.create).not.toHaveBeenCalled();
  });

  it("accepts an identical retry after the receivable has been fully settled", async () => {
    const { tx, entry } = fixture();
    const settled = { ...entry, amountPaid: entry.amount };
    tx.customerReceivable.findFirst.mockResolvedValue(settled);
    tx.customerReceivablePayment.findUnique.mockResolvedValueOnce({
      receivableId: entry.id, amount: 100000, method: "CASH", note: null,
    } as never);

    const result = await payReceivable(tx as unknown as Tx, entry.id, receivablePaymentSchema.parse({
      amount: 100000, method: "CASH", clientMutationId: input.clientMutationId,
    }), user);

    expect(result).toEqual(settled);
    expect(tx.customerReceivable.updateMany).not.toHaveBeenCalled();
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
    expect(tx.customerReceivablePayment.create).not.toHaveBeenCalled();
  });

  it("rejects a new payment against an already settled receivable", async () => {
    const { tx, entry } = fixture();
    tx.customerReceivable.findFirst.mockResolvedValue({ ...entry, amountPaid: entry.amount });
    await expect(payReceivable(tx as unknown as Tx, entry.id, receivablePaymentSchema.parse({
      amount: 0.01, method: "CASH", clientMutationId: input.clientMutationId,
    }), user)).rejects.toMatchObject({ status: 409 });
    expect(tx.customerReceivable.updateMany).not.toHaveBeenCalled();
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
  });

  it("settles the exact fractional remainder using integer cents", async () => {
    const { tx, entry } = fixture();
    tx.customerReceivable.findFirst.mockResolvedValue({ ...entry, amount: 0.3, amountPaid: 0.1 });
    await payReceivable(tx as unknown as Tx, entry.id, receivablePaymentSchema.parse({
      amount: 0.2, method: "QRIS", clientMutationId: input.clientMutationId,
    }), user);
    expect(tx.customerReceivable.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ amount: 0.3, amountPaid: 0.1 }),
      data: { amountPaid: { increment: 0.2 } },
    }));
    expect(tx.customer.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { totalDebt: { decrement: 0.2 } },
    }));
  });

  it("propagates a late duplicate-payment failure to abort the surrounding transaction", async () => {
    const { tx } = fixture();
    const conflict = Object.assign(new Error("Duplicate mutation"), { code: "P2002" });
    tx.customerReceivablePayment.create.mockRejectedValueOnce(conflict);
    await expect(payReceivable(tx as unknown as Tx, "debt-1", receivablePaymentSchema.parse({
      amount: 1000, method: "CASH", clientMutationId: input.clientMutationId,
    }), user)).rejects.toBe(conflict);
  });

  it("rechecks the scoped receivable after acquiring the customer lock", async () => {
    const { tx, entry } = fixture();
    tx.customerReceivable.findFirst.mockResolvedValueOnce(entry).mockResolvedValueOnce(null);
    await expect(payReceivable(tx as unknown as Tx, entry.id, receivablePaymentSchema.parse({
      amount: 1000, method: "CASH", clientMutationId: input.clientMutationId,
    }), user)).rejects.toMatchObject({ status: 404 });
    expect(tx.customerReceivable.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: entry.id, storeId: user.storeId },
    }));
    expect(tx.customerReceivable.updateMany).not.toHaveBeenCalled();
  });

  it.each([0.01, 0.29, 9999999999.99])("accepts valid monetary boundary %s", (amount) => {
    expect(createReceivableSchema.safeParse({ ...input, amount }).success).toBe(true);
    expect(receivablePaymentSchema.safeParse({ amount, method: "DEBIT", clientMutationId: input.clientMutationId }).success).toBe(true);
  });

  it("accepts a valid leap day and rejects a leap day in a non-leap year", () => {
    expect(createReceivableSchema.safeParse({ ...input, debtDate: "2024-02-29", dueDate: "2024-02-29" }).success).toBe(true);
    expect(createReceivableSchema.safeParse({ ...input, debtDate: "2025-02-29" }).success).toBe(false);
  });
});
