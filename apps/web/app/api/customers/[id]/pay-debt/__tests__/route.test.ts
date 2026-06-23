import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const customerFindFirstMock = vi.hoisted(() => vi.fn());
const customerUpdateMock = vi.hoisted(() => vi.fn());
const customerUpdateManyMock = vi.hoisted(() => vi.fn());
const txCustomerFindFirstMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionUpdateMock = vi.hoisted(() => vi.fn());
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
    vi.clearAllMocks();
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
    transactionUpdateMock.mockResolvedValue({});
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        customer: {
          update: customerUpdateMock,
          updateMany: customerUpdateManyMock,
          findFirst: txCustomerFindFirstMock,
        },
        transaction: {
          findFirst: transactionFindFirstMock,
          update: transactionUpdateMock,
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
    expect(transactionUpdateMock).not.toHaveBeenCalled();
  });
});
