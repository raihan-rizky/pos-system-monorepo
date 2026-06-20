import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionUpdateMock = vi.hoisted(() => vi.fn());
const customerUpdateMock = vi.hoisted(() => vi.fn());
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
      update: customerUpdateMock,
    },
    debtPaymentLog: {
      createMany: debtPaymentLogCreateManyMock,
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
    transactionFindFirstMock.mockResolvedValue({
      id: "tx-dp-1",
      status: "DP",
      total: 200000,
      amountPaid: 50000,
      customerId: "customer-1",
    });
    transactionUpdateMock.mockResolvedValue({
      id: "tx-dp-1",
      status: "DP",
      amountPaid: 100000,
    });
    customerUpdateMock.mockResolvedValue({});
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        transaction: {
          update: transactionUpdateMock,
        },
        customer: {
          update: customerUpdateMock,
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
    expect(transactionUpdateMock).toHaveBeenCalledWith({
      where: { id: "tx-dp-1" },
      data: expect.objectContaining({
        amountPaid: 100000,
        status: "DP",
      }),
    });
    expect(customerUpdateMock).toHaveBeenCalledWith({
      where: { id: "customer-1" },
      data: expect.objectContaining({
        totalDebt: { decrement: 50000 },
        totalSpent: { increment: 50000 },
      }),
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
    transactionUpdateMock.mockResolvedValueOnce({
      id: "tx-dp-1",
      status: "COMPLETED",
      amountPaid: 200000,
    });

    const response = await POST(
      new Request("http://localhost/api/transactions/tx-dp-1/pay-debt", {
        method: "POST",
        body: JSON.stringify({ amount: 150000, paymentMethod: "TRANSFER" }),
      }),
      { params: Promise.resolve({ id: "tx-dp-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(transactionUpdateMock).toHaveBeenCalledWith({
      where: { id: "tx-dp-1" },
      data: expect.objectContaining({
        amountPaid: 200000,
        status: "COMPLETED",
      }),
    });
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
});
