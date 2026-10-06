import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const customerFindFirstMock = vi.hoisted(() => vi.fn());
const customerUpdateMock = vi.hoisted(() => vi.fn());
const customerUpdateManyMock = vi.hoisted(() => vi.fn());
const txCustomerFindFirstMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const transactionUpdateMock = vi.hoisted(() => vi.fn());
const transactionUpdateManyMock = vi.hoisted(() => vi.fn());
const debtPaymentLogCreateMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    customer: {
      findFirst: customerFindFirstMock,
    },
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

describe("POST /api/customers/[id]/pay-debt", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    customerFindFirstMock.mockResolvedValue({
      id: "customer-1",
      name: "Customer One",
      totalDebt: 100000,
    });
    customerUpdateMock.mockResolvedValue({
      id: "customer-1",
      name: "Customer One",
      totalDebt: 50000,
      totalSpent: 50000,
    });
    // Guarded decrement: matches exactly one row when debt is sufficient.
    customerUpdateManyMock.mockResolvedValue({ count: 1 });
    // In-transaction re-read used to build the response after the guarded write.
    txCustomerFindFirstMock.mockResolvedValue({
      id: "customer-1",
      name: "Customer One",
      totalDebt: 50000,
      totalSpent: 50000,
    });
    transactionFindFirstMock.mockResolvedValue({
      id: "tx-dp-1",
      total: 100000,
      amountPaid: 0,
    });
    transactionFindManyMock.mockResolvedValue([
      {
        id: "tx-dp-1",
        total: 100000,
        amountPaid: 0,
        status: "DP",
        paymentMethod: "CASH",
        note: null,
      },
    ]);
    transactionUpdateMock.mockResolvedValue({});
    transactionUpdateManyMock.mockResolvedValue({ count: 1 });
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        customer: {
          update: customerUpdateMock,
          updateMany: customerUpdateManyMock,
          findFirst: txCustomerFindFirstMock,
        },
        transaction: {
          findFirst: transactionFindFirstMock,
          findMany: transactionFindManyMock,
          update: transactionUpdateMock,
          updateMany: transactionUpdateManyMock,
        },
        debtPaymentLog: { create: debtPaymentLogCreateMock },
      }),
    );
  });

  it("logs customer debt payments against the DP transaction inside the transaction", async () => {
    const response = await POST(
      new Request("http://localhost/api/customers/customer-1/pay-debt", {
        method: "POST",
        body: JSON.stringify({
          amount: 50000,
          paymentMethod: "TRANSFER",
          note: "Pelunasan sebagian",
        }),
      }),
      { params: Promise.resolve({ id: "customer-1" }) },
    );

    expect(response.status).toBe(200);
    expect(debtPaymentLogCreateMock).toHaveBeenCalledWith({
      data: {
        transactionId: "tx-dp-1",
        customerId: "customer-1",
        storeId: "store-main",
        amount: 50000,
        paymentMethod: "TRANSFER",
        note: "Pelunasan sebagian",
      },
    });
  });

  it("allocates a customer payment across DP and Tempo invoices without changing Tempo status", async () => {
    customerFindFirstMock.mockResolvedValueOnce({
      id: "customer-1",
      name: "Customer One",
      totalDebt: 125000,
    });
    transactionFindManyMock.mockResolvedValueOnce([
      {
        id: "tx-dp-1",
        total: 100000,
        amountPaid: 50000,
        status: "DP",
        paymentMethod: "CASH",
        note: null,
      },
      {
        id: "tx-tempo-1",
        total: 200000,
        amountPaid: 25000,
        status: "COMPLETED",
        paymentMethod: "TEMPO",
        note: null,
      },
    ]);
    transactionUpdateManyMock.mockResolvedValue({ count: 1 });

    const response = await POST(
      new Request("http://localhost/api/customers/customer-1/pay-debt", {
        method: "POST",
        body: JSON.stringify({ amount: 125000, paymentMethod: "CASH" }),
      }),
      { params: Promise.resolve({ id: "customer-1" }) },
    );

    expect(response.status).toBe(200);
    expect(transactionFindManyMock).toHaveBeenCalledWith({
      where: {
        customerId: "customer-1",
        storeId: "store-main",
        OR: [
          { status: "DP" },
          { status: "COMPLETED", paymentMethod: "TEMPO" },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        total: true,
        amountPaid: true,
        status: true,
        paymentMethod: true,
        note: true,
      },
    });
    expect(transactionUpdateManyMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ id: "tx-dp-1", amountPaid: 50000, status: "DP" }),
        data: expect.objectContaining({ amountPaid: 100000, status: "COMPLETED" }),
      }),
    );
    expect(transactionUpdateManyMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: "tx-tempo-1",
          amountPaid: 25000,
          status: "COMPLETED",
          paymentMethod: "TEMPO",
        }),
        data: expect.objectContaining({ amountPaid: 100000, status: "COMPLETED" }),
      }),
    );
    expect(debtPaymentLogCreateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ transactionId: "tx-dp-1", amount: 50000 }),
      }),
    );
    expect(debtPaymentLogCreateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ transactionId: "tx-tempo-1", amount: 75000 }),
      }),
    );
  });

  it("decrements debt with a balance-guarded write (gte amount), not an unconditional decrement", async () => {
    await POST(
      new Request("http://localhost/api/customers/customer-1/pay-debt", {
        method: "POST",
        body: JSON.stringify({ amount: 50000, paymentMethod: "CASH" }),
      }),
      { params: Promise.resolve({ id: "customer-1" }) },
    );

    expect(customerUpdateManyMock).toHaveBeenCalledTimes(1);
    const args = customerUpdateManyMock.mock.calls[0][0];
    expect(args.where).toMatchObject({
      id: "customer-1",
      storeId: "store-main",
      totalDebt: { gte: 50000 },
    });
    expect(args.data).toMatchObject({
      totalDebt: { decrement: 50000 },
      totalSpent: { increment: 50000 },
    });
  });

  it("returns 409 and records no payment when a concurrent payment already cleared the debt", async () => {
    // Race: another request decremented the debt between our read and write,
    // so the guarded updateMany matches zero rows.
    customerUpdateManyMock.mockResolvedValue({ count: 0 });

    const response = await POST(
      new Request("http://localhost/api/customers/customer-1/pay-debt", {
        method: "POST",
        body: JSON.stringify({ amount: 100000, paymentMethod: "CASH" }),
      }),
      { params: Promise.resolve({ id: "customer-1" }) },
    );

    expect(response.status).toBe(409);
    expect(debtPaymentLogCreateMock).not.toHaveBeenCalled();
    expect(transactionUpdateManyMock).not.toHaveBeenCalled();
  });
});
