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
    vi.clearAllMocks();
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
        transaction: {
          findFirst: txTransactionFindFirstMock,
          updateMany: transactionUpdateManyMock,
        },
        customer: {
          updateMany: customerUpdateManyMock,
        },
        debtPaymentLog: {
          createMany: debtPaymentLogCreateManyMock,
        },
      }),
    );
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
    expect(transactionUpdateManyMock).toHaveBeenCalledTimes(1);
    const txArgs = transactionUpdateManyMock.mock.calls[0][0];
    expect(txArgs.where).toMatchObject({ id: "tx-dp-1", storeId: "store-main", status: "DP" });
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
