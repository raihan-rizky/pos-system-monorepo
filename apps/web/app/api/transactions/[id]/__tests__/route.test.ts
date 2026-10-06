import { beforeEach, describe, expect, it, vi } from "vitest";

const afterMock = vi.hoisted(() => vi.fn());
const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionFindUniqueMock = vi.hoisted(() => vi.fn());
const transactionUpdateMock = vi.hoisted(() => vi.fn());
const transactionItemDeleteManyMock = vi.hoisted(() => vi.fn());
const transactionDeleteMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateManyMock = vi.hoisted(() => vi.fn());
const lifecycleAuditCreateMock = vi.hoisted(() => vi.fn());
const applyProductStockDeltasMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const inventoryLogFindManyMock = vi.hoisted(() => vi.fn());
const inventoryLogUpdateManyMock = vi.hoisted(() => vi.fn());
const transactionAuditFindFirstMock = vi.hoisted(() => vi.fn());
const transactionDeleteManyMock = vi.hoisted(() => vi.fn());
const productUpdateManyMock = vi.hoisted(() => vi.fn());
const productFindFirstMock = vi.hoisted(() => vi.fn());
const productStockGroupUpdateManyMock = vi.hoisted(() => vi.fn());
const productStockGroupFindFirstMock = vi.hoisted(() => vi.fn());
const customerUpdateManyMock = vi.hoisted(() => vi.fn());
const transactionRowLockMock = vi.hoisted(() => vi.fn());

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: afterMock };
});

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/product-stock-groups/stock-mutations", () => ({
  applyProductStockDeltas: applyProductStockDeltasMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    transaction: {
      findFirst: transactionFindFirstMock,
      findUnique: transactionFindUniqueMock,
      update: transactionUpdateMock,
      delete: transactionDeleteMock,
    },
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

import { DELETE, GET, PATCH } from "../route";

describe("GET /api/transactions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "cashier-1",
      role: "CASHIER",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
  });

  it("serializes transactions without reading a missing updatedAt field", async () => {
    const transactionCreatedAt = new Date("2026-06-16T08:30:00.000Z");
    const invoiceDate = new Date("2026-07-02T03:00:00.000Z");

    transactionFindFirstMock.mockResolvedValue({
      id: "tx-1",
      invoiceNumber: "INV-001",
      storeId: "store-main",
      subtotal: 100000,
      discount: 0,
      tax: 0,
      total: 100000,
      paymentMethod: "CASH",
      amountPaid: 100000,
      change: 0,
      status: "COMPLETED",
      customerName: null,
      salesName: null,
      salespersonId: null,
      note: null,
      invoiceDate,
      createdAt: transactionCreatedAt,
      cashier: { name: "Cashier One" },
      salesperson: null,
      invoiceDateChangeLogs: [
        {
          id: "change-1",
          oldInvoiceDate: new Date("2026-06-16T08:30:00.000Z"),
          newInvoiceDate: invoiceDate,
          oldDocumentNumber: "INV-20260616-0001",
          newDocumentNumber: "INV-20260702-0001",
          reason: "Tanggal invoice disesuaikan",
          actorName: "Owner One",
          actorRole: "OWNER",
          createdAt: new Date("2026-07-09T03:00:00.000Z"),
        },
      ],
      items: [
        {
          id: "item-1",
          transactionId: "tx-1",
          productId: null,
          printingServiceId: "service-1",
          productName: "X Banner",
          size: null,
          material: null,
          quantity: 1,
          unitPrice: 100000,
          subtotal: 100000,
          product: null,
          printingService: { unit: "pcs" },
        },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/transactions/tx-1"),
      { params: Promise.resolve({ id: "tx-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(transactionFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          invoiceDateChangeLogs: expect.objectContaining({
            orderBy: { createdAt: "desc" },
          }),
        }),
      }),
    );
    expect(body.invoiceDate).toBe("2026-07-02T03:00:00.000Z");
    expect(body.createdAt).toBe("2026-06-16T08:30:00.000Z");
    expect(body.updatedAt).toBeUndefined();
    expect(body.items[0].createdAt).toBe("2026-06-16T08:30:00.000Z");
    expect(body.invoiceDateChangeLogs[0]).toEqual(
      expect.objectContaining({
        oldInvoiceDate: "2026-06-16T08:30:00.000Z",
        newInvoiceDate: "2026-07-02T03:00:00.000Z",
        oldDocumentNumber: "INV-20260616-0001",
        newDocumentNumber: "INV-20260702-0001",
        reason: "Tanggal invoice disesuaikan",
      }),
    );
  });
});

describe("PATCH /api/transactions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      role: "OWNER",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
  });

  it("syncs the single payment badge method when paymentMethod changes", async () => {
    transactionFindFirstMock.mockResolvedValue({
      id: "tx-1",
      status: "COMPLETED",
      payments: [{ id: "payment-1" }],
    });
    transactionUpdateMock.mockResolvedValue({
      id: "tx-1",
      paymentMethod: "CREDIT",
      status: "COMPLETED",
      items: [],
      cashier: { name: "Owner One" },
    });

    const response = await PATCH(
      new Request("http://localhost/api/transactions/tx-1", {
        method: "PATCH",
        body: JSON.stringify({ paymentMethod: "CREDIT" }),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tx-1" },
        data: expect.objectContaining({
          paymentMethod: "CREDIT",
          payments: {
            updateMany: {
              where: {},
              data: { method: "CREDIT" },
            },
          },
        }),
      }),
    );
  });
});

describe("DELETE /api/transactions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner One",
      role: "OWNER",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    transactionFindFirstMock.mockResolvedValue({
      id: "tx-1",
      status: "COMPLETED",
    });
    transactionFindUniqueMock.mockResolvedValue({
      id: "tx-1",
      invoiceNumber: "INV-001",
      customerId: null,
      total: 100,
      amountPaid: 100,
      status: "COMPLETED",
      items: [
        {
          id: "item-1",
          productId: "finished-paper",
          rawMaterialProductId: "raw-paper",
          rawMaterialQuantity: 3,
          productName: "Printed poster",
          quantity: 2,
          unitCost: 4,
        },
      ],
      payments: [],
      productionActivityLogs: [],
      invoiceDateChangeLogs: [],
      debtPaymentLogs: [],
      inventoryLogs: [
        {
          id: "log-1",
          productId: "finished-paper",
          stockGroupIdSnapshot: null,
          stockBaseDelta: -2,
        },
        {
          id: "log-2",
          productId: "raw-paper",
          stockGroupIdSnapshot: null,
          stockBaseDelta: -3,
        },
      ],
      suratJalan: [],
      expenses: [],
    });
    applyProductStockDeltasMock.mockResolvedValue([]);
    inventoryLogFindManyMock.mockResolvedValue([
      {
        id: "sale-finished",
        productId: "finished-paper",
        type: "OUT",
        reason: "SALE",
        status: "APPROVED",
        quantity: 2,
        stockGroupIdSnapshot: null,
        unitMultiplierSnapshot: 1,
        stockBaseDelta: -2,
        transactionId: "tx-1",
        sourceTransactionRef: "tx-1",
        suratJalanId: null,
      },
      {
        id: "sale-paper",
        productId: "raw-paper",
        type: "OUT",
        reason: "SALE",
        status: "APPROVED",
        quantity: 3,
        stockGroupIdSnapshot: null,
        unitMultiplierSnapshot: 1,
        stockBaseDelta: -3,
        transactionId: "tx-1",
        sourceTransactionRef: "tx-1",
        suratJalanId: null,
      },
    ]);
    inventoryLogUpdateManyMock.mockResolvedValue({ count: 2 });
    transactionAuditFindFirstMock.mockResolvedValue(null);
    transactionDeleteManyMock.mockResolvedValue({ count: 1 });
    productUpdateManyMock.mockResolvedValue({ count: 1 });
    productFindFirstMock.mockResolvedValue({ stock: 2, stockGroupId: null });
    productStockGroupUpdateManyMock.mockResolvedValue({ count: 1 });
    productStockGroupFindFirstMock.mockResolvedValue({ baseStock: 3 });
    customerUpdateManyMock.mockResolvedValue({ count: 1 });
    transactionRowLockMock.mockResolvedValue([{ id: "tx-1" }]);
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        $queryRawUnsafe: transactionRowLockMock,
        transaction: {
          findUnique: transactionFindUniqueMock,
          findFirst: transactionFindUniqueMock,
          updateMany: transactionUpdateMock,
          deleteMany: transactionDeleteManyMock,
          delete: transactionDeleteMock,
        },
        transactionItem: { deleteMany: transactionItemDeleteManyMock },
        inventoryLog: {
          findMany: inventoryLogFindManyMock,
          createMany: inventoryLogCreateManyMock,
          updateMany: inventoryLogUpdateManyMock,
        },
        product: { updateMany: productUpdateManyMock, findFirst: productFindFirstMock },
        productStockGroup: {
          updateMany: productStockGroupUpdateManyMock,
          findFirst: productStockGroupFindFirstMock,
        },
        customer: { updateMany: customerUpdateManyMock },
        transactionLifecycleAudit: {
          findFirst: transactionAuditFindFirstMock,
          create: lifecycleAuditCreateMock,
        },
      }),
    );
  });

  it("restores product and raw-material stock once and saves a lifecycle snapshot", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/transactions/tx-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(204);
    expect(productUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "finished-paper", storeId: "store-main", stockGroupId: null },
      data: { stock: { increment: 2 } },
    });
    expect(productUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "raw-paper", storeId: "store-main", stockGroupId: null },
      data: { stock: { increment: 3 } },
    });
    expect(inventoryLogUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { transactionId: null, sourceTransactionRef: "tx-1" } }),
    );
    expect(lifecycleAuditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionId: "tx-1",
          action: "DELETE",
          snapshot: expect.objectContaining({
            items: expect.any(Array),
            stockJournal: expect.any(Array),
            productionActivityLogs: expect.any(Array),
            stockResults: expect.any(Array),
          }),
        }),
      }),
    );
  });
});
