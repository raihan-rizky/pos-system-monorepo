import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const txTransactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionUpdateManyMock = vi.hoisted(() => vi.fn());
const customerFindFirstMock = vi.hoisted(() => vi.fn());
const customerUpdateManyMock = vi.hoisted(() => vi.fn());
const debtPaymentLogCreateManyMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const lockCustomerMock = vi.hoisted(() => vi.fn());
const transactionFindFirstOrThrowMock = vi.hoisted(() => vi.fn());
const receiptChangeCreateMock = vi.hoisted(() => vi.fn());
const ownerFindManyMock = vi.hoisted(() => vi.fn());
const notificationCreateManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    transaction: {
      findFirst: transactionFindFirstMock,
    },
    customer: {
      findFirst: customerFindFirstMock,
    },
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

describe("POST /api/transactions/[id]/pay-debt", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "cashier-1",
      name: "Cashier One",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);

    const dpRow = {
      id: "tx-dp-1",
      status: "DP",
      total: 200000,
      amountPaid: 50000,
      customerId: "customer-1",
      note: null,
    };
    // Outer (pre-transaction) read used for validation messaging.
    transactionFindFirstMock.mockResolvedValue({ ...dpRow });
    // In-transaction authoritative re-read.
    txTransactionFindFirstMock.mockResolvedValue({ ...dpRow });
    // Optimistically guarded writes match exactly one row by default.
    transactionUpdateManyMock.mockResolvedValue({ count: 1 });
    customerUpdateManyMock.mockResolvedValue({ count: 1 });
    customerFindFirstMock.mockResolvedValue({ id: "customer-1" });

    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        $queryRawUnsafe: lockCustomerMock.mockResolvedValue([{ id: "customer-1" }]),
        transaction: {
          findFirst: txTransactionFindFirstMock,
          findFirstOrThrow: transactionFindFirstOrThrowMock,
          updateMany: transactionUpdateManyMock,
        },
        customer: {
          updateMany: customerUpdateManyMock,
        },
        debtPaymentLog: {
          createMany: debtPaymentLogCreateManyMock,
        },
        transactionReceiptChange: { create: receiptChangeCreateMock },
        user: { findMany: ownerFindManyMock },
        notification: { createMany: notificationCreateManyMock },
      }),
    );
    const receiptRow = {
      id: "tx-dp-1", storeId: "store-main", invoiceNumber: "INV-DP-1", invoiceDate: new Date("2026-11-04T02:00:00Z"),
      customerId: "customer-1", customerName: "Pelanggan", salespersonId: "salesperson-1", salesName: "Sales",
      note: null, status: "DP", paymentMethod: "CASH", subtotal: 200000, discount: 0, tax: 0, taxRate: null,
      taxMethod: "EXCLUSIVE", total: 200000, amountPaid: 50000, change: 0,
      payments: [{ id: "payment-1", method: "CASH", amount: 50000 }], debtPaymentLogs: [], items: [], printingReceipt: null,
    };
    transactionFindFirstOrThrowMock.mockResolvedValueOnce(receiptRow).mockResolvedValue({
      ...receiptRow,
      amountPaid: 100000,
      debtPaymentLogs: [{ paymentMethod: "TRANSFER", amount: 50000 }],
    });
    receiptChangeCreateMock.mockResolvedValue({ id: "change-1" });
    ownerFindManyMock.mockResolvedValue([{ id: "owner-1" }]);
    notificationCreateManyMock.mockResolvedValue({ count: 1 });
  });

  it("keeps a DP transaction open when payment is below remaining debt", async () => {
    const response = await POST(
      new Request("http://localhost/api/transactions/tx-dp-1/pay-debt", {
        method: "POST",
        body: JSON.stringify({ amount: 50000, paymentMethod: "CASH" }),
      }),
      { params: Promise.resolve({ id: "tx-dp-1" }) },
    );

    expect(response.status).toBe(200);
    expect(lockCustomerMock).toHaveBeenCalledWith(expect.stringContaining("pos_customers"), "customer-1", "store-main");
    expect(lockCustomerMock).toHaveBeenNthCalledWith(2, expect.stringContaining('"pos_transactions"'), "tx-dp-1", "store-main");
    expect(lockCustomerMock.mock.invocationCallOrder[1]).toBeLessThan(txTransactionFindFirstMock.mock.invocationCallOrder[0]);
    expect(transactionUpdateManyMock).toHaveBeenCalledTimes(1);
    const txArgs = transactionUpdateManyMock.mock.calls[0][0];
    expect(txArgs.where).toMatchObject({ id: "tx-dp-1", storeId: "store-main", status: "DP", total: 200000 });
    expect(txArgs.data).toMatchObject({ amountPaid: 100000, status: "DP" });

    expect(customerUpdateManyMock).toHaveBeenCalledTimes(1);
    const custArgs = customerUpdateManyMock.mock.calls[0][0];
    expect(custArgs.where).toMatchObject({
      id: "customer-1",
      storeId: "store-main",
      totalDebt: { gte: 50000 },
    });
    expect(custArgs.data).toMatchObject({
      totalDebt: { decrement: 50000 },
      totalSpent: { increment: 50000 },
    });

    expect(debtPaymentLogCreateManyMock).toHaveBeenCalledWith({
      data: [
        {
          transactionId: "tx-dp-1",
          customerId: "customer-1",
          storeId: "store-main",
          amount: 50000,
          paymentMethod: "CASH",
          note: null,
        },
      ],
    });
  });

  it("marks a DP transaction completed when the remaining debt is fully paid", async () => {
    const response = await POST(
      new Request("http://localhost/api/transactions/tx-dp-1/pay-debt", {
        method: "POST",
        body: JSON.stringify({ amount: 150000, paymentMethod: "TRANSFER" }),
      }),
      { params: Promise.resolve({ id: "tx-dp-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    const txArgs = transactionUpdateManyMock.mock.calls[0][0];
    expect(txArgs.data).toMatchObject({ amountPaid: 200000, status: "COMPLETED" });
    expect(body.transaction).toEqual({
      id: "tx-dp-1",
      amountPaid: 200000,
      status: "COMPLETED",
    });
  });

  it("rejects payments above the remaining debt", async () => {
    const response = await POST(
      new Request("http://localhost/api/transactions/tx-dp-1/pay-debt", {
        method: "POST",
        body: JSON.stringify({ amount: 150001, paymentMethod: "CASH" }),
      }),
      { params: Promise.resolve({ id: "tx-dp-1" }) },
    );

    expect(response.status).toBe(422);
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("records a partial Tempo settlement without changing its invoice status or method", async () => {
    const tempoRow = {
      id: "tx-dp-1",
      status: "COMPLETED",
      paymentMethod: "TEMPO",
      total: 200000,
      amountPaid: 50000,
      customerId: "customer-1",
      note: null,
    };
    transactionFindFirstMock.mockResolvedValueOnce(tempoRow);
    txTransactionFindFirstMock.mockResolvedValueOnce(tempoRow);

    const response = await POST(
      new Request("http://localhost/api/transactions/tx-dp-1/pay-debt", {
        method: "POST",
        body: JSON.stringify({ amount: 25000, paymentMethod: "CASH" }),
      }),
      { params: Promise.resolve({ id: "tx-dp-1" }) },
    );

    expect(response.status).toBe(200);
    const txArgs = transactionUpdateManyMock.mock.calls[0][0];
    expect(txArgs.where).toMatchObject({
      id: "tx-dp-1",
      storeId: "store-main",
      status: "COMPLETED",
      paymentMethod: "TEMPO",
      amountPaid: 50000,
    });
    expect(txArgs.data).toMatchObject({ amountPaid: 75000, status: "COMPLETED" });
    expect(txArgs.data).not.toHaveProperty("paymentMethod");
    expect(debtPaymentLogCreateManyMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          transactionId: "tx-dp-1",
          amount: 25000,
          paymentMethod: "CASH",
        }),
      ],
    });
  });

  it("records a processed DP settlement made by Sales with its debt payment details", async () => {
    requirePermissionMock.mockResolvedValue({ id: "sales-1", name: "Sales One", role: "SALES", storeId: "store-main" });
    const response = await POST(
      new Request("http://localhost/api/transactions/tx-dp-1/pay-debt", {
        method: "POST",
        body: JSON.stringify({ amount: 50000, paymentMethod: "TRANSFER" }),
      }),
      { params: Promise.resolve({ id: "tx-dp-1" }) },
    );

    expect(response.status).toBe(200);
    expect(receiptChangeCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actorId: "sales-1",
        before: expect.objectContaining({ status: "DP", amountPaid: 50000, debtPayments: [] }),
        after: expect.objectContaining({ status: "DP", amountPaid: 100000, debtPayments: [{ method: "TRANSFER", amount: 50000 }] }),
      }),
    }));
    expect(notificationCreateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ userId: "owner-1", tag: "change-1" })],
    }));
  });

  it("keeps a fully settled Tempo invoice in COMPLETED status", async () => {
    const tempoRow = {
      id: "tx-dp-1",
      status: "COMPLETED",
      paymentMethod: "TEMPO",
      total: 200000,
      amountPaid: 50000,
      customerId: "customer-1",
      note: null,
    };
    transactionFindFirstMock.mockResolvedValueOnce(tempoRow);
    txTransactionFindFirstMock.mockResolvedValueOnce(tempoRow);

    const response = await POST(
      new Request("http://localhost/api/transactions/tx-dp-1/pay-debt", {
        method: "POST",
        body: JSON.stringify({ amount: 150000, paymentMethod: "TRANSFER" }),
      }),
      { params: Promise.resolve({ id: "tx-dp-1" }) },
    );

    expect(response.status).toBe(200);
    const txArgs = transactionUpdateManyMock.mock.calls[0][0];
    expect(txArgs.data).toMatchObject({ amountPaid: 200000, status: "COMPLETED" });
  });

  it("uses the selected customer for an unlinked DP transaction so payment history is retained", async () => {
    const unlinked = {
      id: "tx-dp-1",
      status: "DP",
      total: 200000,
      amountPaid: 50000,
      customerId: null,
      note: null,
    };
    transactionFindFirstMock.mockResolvedValueOnce({ ...unlinked });
    txTransactionFindFirstMock.mockResolvedValueOnce({ ...unlinked });

    const response = await POST(
      new Request("http://localhost/api/transactions/tx-dp-1/pay-debt", {
        method: "POST",
        body: JSON.stringify({
          customerId: "customer-1",
          amount: 150000,
          paymentMethod: "TRANSFER",
        }),
      }),
      { params: Promise.resolve({ id: "tx-dp-1" }) },
    );

    expect(response.status).toBe(200);
    const txArgs = transactionUpdateManyMock.mock.calls[0][0];
    expect(txArgs.data).toMatchObject({
      amountPaid: 200000,
      status: "COMPLETED",
      customerId: "customer-1",
    });
    expect(debtPaymentLogCreateManyMock).toHaveBeenCalledWith({
      data: [
        {
          transactionId: "tx-dp-1",
          customerId: "customer-1",
          storeId: "store-main",
          amount: 150000,
          paymentMethod: "TRANSFER",
          note: null,
        },
      ],
    });
  });

  it.each([
    { amount: 50000, status: "DP" },
    { amount: 150000, status: "COMPLETED" },
  ])("records an Umum DP payment of $amount without requiring a customer", async ({ amount, status }) => {
    const unlinked = { id: "tx-dp-1", status: "DP", paymentMethod: "CASH", total: 200000, amountPaid: 50000, customerId: null, note: null };
    transactionFindFirstMock.mockResolvedValue({ ...unlinked });
    txTransactionFindFirstMock.mockResolvedValue({ ...unlinked });

    const response = await POST(new Request("http://localhost/api/transactions/tx-dp-1/pay-debt", {
      method: "POST", body: JSON.stringify({ amount, paymentMethod: "TRANSFER" }),
    }), { params: Promise.resolve({ id: "tx-dp-1" }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ transaction: { amountPaid: 50000 + amount, status } });
    expect(transactionUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ customerId: null, amountPaid: 50000 }),
      data: expect.objectContaining({ amountPaid: 50000 + amount, status }),
    }));
    expect(transactionUpdateManyMock.mock.calls[0][0].data).not.toHaveProperty("customerId");
    expect(customerFindFirstMock).not.toHaveBeenCalled();
    expect(lockCustomerMock).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('"pos_transactions"'), "tx-dp-1", "store-main");
    expect(lockCustomerMock.mock.invocationCallOrder[0]).toBeLessThan(txTransactionFindFirstMock.mock.invocationCallOrder[0]);
    expect(customerUpdateManyMock).not.toHaveBeenCalled();
    expect(debtPaymentLogCreateManyMock).toHaveBeenCalledWith({ data: [{
      transactionId: "tx-dp-1", customerId: null, storeId: "store-main", amount, paymentMethod: "TRANSFER", note: null,
    }] });
  });

  it("preserves each payment method and note when an Umum invoice is settled", async () => {
    const unlinked = { id: "tx-dp-1", status: "DP", paymentMethod: "CASH", total: 200000, amountPaid: 50000, customerId: null, note: null };
    transactionFindFirstMock.mockResolvedValue({ ...unlinked });
    txTransactionFindFirstMock.mockResolvedValue({ ...unlinked });
    const response = await POST(new Request("http://localhost/api/transactions/tx-dp-1/pay-debt", {
      method: "POST", body: JSON.stringify({ amount: 150000, note: "Pelunasan umum", payments: [
        { method: "CASH", amount: 50000 }, { method: "QRIS", amount: 100000 },
      ] }),
    }), { params: Promise.resolve({ id: "tx-dp-1" }) });
    expect(response.status).toBe(200);
    expect(debtPaymentLogCreateManyMock).toHaveBeenCalledWith({ data: [
      { transactionId: "tx-dp-1", customerId: null, storeId: "store-main", amount: 50000, paymentMethod: "CASH", note: "Pelunasan umum" },
      { transactionId: "tx-dp-1", customerId: null, storeId: "store-main", amount: 100000, paymentMethod: "QRIS", note: "Pelunasan umum" },
    ] });
  });

  it("rejects an Umum payment when the invoice was concurrently linked to a customer", async () => {
    transactionFindFirstMock.mockResolvedValue({ id: "tx-dp-1", status: "DP", total: 200000, amountPaid: 50000, customerId: null, note: null });
    const response = await POST(new Request("http://localhost/api/transactions/tx-dp-1/pay-debt", {
      method: "POST", body: JSON.stringify({ amount: 150000 }),
    }), { params: Promise.resolve({ id: "tx-dp-1" }) });
    expect(response.status).toBe(409);
    expect(transactionUpdateManyMock).not.toHaveBeenCalled();
    expect(debtPaymentLogCreateManyMock).not.toHaveBeenCalled();
  });

  it("rejects a concurrent Umum settlement without recording a duplicate payment", async () => {
    const unlinked = { id: "tx-dp-1", status: "DP", total: 200000, amountPaid: 50000, customerId: null, note: null };
    transactionFindFirstMock.mockResolvedValue({ ...unlinked });
    txTransactionFindFirstMock.mockResolvedValue({ ...unlinked });
    transactionUpdateManyMock.mockResolvedValue({ count: 0 });
    const response = await POST(new Request("http://localhost/api/transactions/tx-dp-1/pay-debt", {
      method: "POST", body: JSON.stringify({ amount: 150000 }),
    }), { params: Promise.resolve({ id: "tx-dp-1" }) });
    expect(response.status).toBe(409);
    expect(customerUpdateManyMock).not.toHaveBeenCalled();
    expect(debtPaymentLogCreateManyMock).not.toHaveBeenCalled();
  });

  it("returns 409 when a concurrent payment already completed the transaction", async () => {
    // In-tx re-read sees the transaction already paid off by a racing request.
    txTransactionFindFirstMock.mockResolvedValueOnce({
      id: "tx-dp-1",
      status: "COMPLETED",
      total: 200000,
      amountPaid: 200000,
      customerId: "customer-1",
      note: null,
    });

    const response = await POST(
      new Request("http://localhost/api/transactions/tx-dp-1/pay-debt", {
        method: "POST",
        body: JSON.stringify({ amount: 150000, paymentMethod: "CASH" }),
      }),
      { params: Promise.resolve({ id: "tx-dp-1" }) },
    );

    expect(response.status).toBe(409);
    expect(transactionUpdateManyMock).not.toHaveBeenCalled();
    expect(customerUpdateManyMock).not.toHaveBeenCalled();
    expect(debtPaymentLogCreateManyMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the guarded transaction write matches no row (lost optimistic race)", async () => {
    transactionUpdateManyMock.mockResolvedValue({ count: 0 });

    const response = await POST(
      new Request("http://localhost/api/transactions/tx-dp-1/pay-debt", {
        method: "POST",
        body: JSON.stringify({ amount: 50000, paymentMethod: "CASH" }),
      }),
      { params: Promise.resolve({ id: "tx-dp-1" }) },
    );

    expect(response.status).toBe(409);
    expect(customerUpdateManyMock).not.toHaveBeenCalled();
    expect(debtPaymentLogCreateManyMock).not.toHaveBeenCalled();
  });
});
