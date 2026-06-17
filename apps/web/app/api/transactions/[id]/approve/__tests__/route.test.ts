import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const afterMock = vi.hoisted(() => vi.fn());
const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionUpdateManyMock = vi.hoisted(() => vi.fn());
const transactionFindUniqueOrThrowMock = vi.hoisted(() => vi.fn());
const productUpdateManyMock = vi.hoisted(() => vi.fn());
const queryRawMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateManyMock = vi.hoisted(() => vi.fn());
const customerUpdateMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: afterMock,
  };
});

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    transaction: {
      findFirst: transactionFindFirstMock,
    },
    inventoryLog: {
      createMany: inventoryLogCreateManyMock,
    },
    customer: {
      update: customerUpdateMock,
    },
    $transaction: dbTransactionMock,
  },
}));

describe("POST /api/transactions/[id]/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterMock.mockImplementation((callback: () => void | Promise<void>) => callback());
    requirePermissionMock.mockResolvedValue({
      id: "cashier-1",
      name: "Cashier One",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    transactionFindFirstMock.mockResolvedValue({
      id: "tx-1",
      invoiceNumber: "INV-20260520-0001",
      storeId: "store-main",
      status: "PENDING_APPROVAL",
      total: 50000,
      paymentMethod: "TRANSFER",
      amountPaid: 50000,
      change: 0,
      customerId: "customer-1",
      items: [
        { productId: "product-1", quantity: 2 },
        { productId: "product-2", quantity: 1 },
      ],
    });
    transactionUpdateManyMock.mockResolvedValue({ count: 1 });
    transactionFindUniqueOrThrowMock.mockResolvedValue({
      id: "tx-1",
      status: "COMPLETED",
      items: [],
    });
    productUpdateManyMock.mockResolvedValue({ count: 1 });
    queryRawMock.mockResolvedValue([{ id: "product-1" }, { id: "product-2" }]);
    inventoryLogCreateMock.mockResolvedValue({});
    inventoryLogCreateManyMock.mockResolvedValue({ count: 2 });
    customerUpdateMock.mockResolvedValue({});
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        transaction: {
          updateMany: transactionUpdateManyMock,
          findUniqueOrThrow: transactionFindUniqueOrThrowMock,
        },
        inventoryLog: {
          create: inventoryLogCreateMock,
        },
        customer: {
          update: customerUpdateMock,
        },
        $queryRaw: queryRawMock,
      }),
    );
  });

  it("uses the checkout transaction budget and keeps per-item side effects out of the interactive transaction", async () => {
    const response = await POST(
      new Request("http://localhost/api/transactions/tx-1/approve", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "CASH",
          amountPaid: 50000,
        }),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    expect(dbTransactionMock).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5000,
      timeout: 15000,
    });
    expect(queryRawMock).toHaveBeenCalledTimes(1);
    expect(transactionFindUniqueOrThrowMock).not.toHaveBeenCalled();
    expect(productUpdateManyMock).not.toHaveBeenCalled();
    expect(inventoryLogCreateMock).not.toHaveBeenCalled();
  });

  it("approves a pending transaction without re-entering payment fields", async () => {
    const response = await POST(
      new Request("http://localhost/api/transactions/tx-1/approve", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    expect(transactionUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "tx-1", storeId: "store-main", status: "PENDING_APPROVAL" },
      data: expect.objectContaining({
        status: "COMPLETED",
        cashierId: "cashier-1",
        paymentMethod: "TRANSFER",
        amountPaid: 50000,
        change: 0,
      }),
    });
  });

  it("preserves stored overpayment and change when approving", async () => {
    transactionFindFirstMock.mockResolvedValueOnce({
      id: "tx-1",
      invoiceNumber: "INV-20260520-0001",
      storeId: "store-main",
      status: "PENDING_APPROVAL",
      total: 50000,
      paymentMethod: "CASH",
      amountPaid: 60000,
      change: 10000,
      customerId: "customer-1",
      items: [{ productId: "product-1", quantity: 1 }],
    });
    queryRawMock.mockResolvedValueOnce([{ id: "product-1" }]);

    const response = await POST(
      new Request("http://localhost/api/transactions/tx-1/approve", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    expect(transactionUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "tx-1", storeId: "store-main", status: "PENDING_APPROVAL" },
      data: expect.objectContaining({
        status: "COMPLETED",
        amountPaid: 60000,
        change: 10000,
      }),
    });
  });

  it("approves a sales-created regular invoice while preserving its invoice status", async () => {
    transactionFindFirstMock.mockResolvedValueOnce({
      id: "tx-1",
      invoiceNumber: "INV-20260520-0001",
      storeId: "store-main",
      status: "COMPLETED",
      cashierId: null,
      requestedById: "sales-1",
      total: 50000,
      paymentMethod: "TRANSFER",
      amountPaid: 50000,
      change: 0,
      customerId: "customer-1",
      items: [{ productId: "product-1", quantity: 1 }],
    });
    queryRawMock.mockResolvedValueOnce([{ id: "product-1" }]);

    const response = await POST(
      new Request("http://localhost/api/transactions/tx-1/approve", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    expect(transactionUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: "tx-1",
        storeId: "store-main",
        requestedById: { not: null },
        cashierId: null,
      },
      data: expect.objectContaining({
        status: "COMPLETED",
        cashierId: "cashier-1",
        amountPaid: 50000,
        change: 0,
      }),
    });
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });
});
