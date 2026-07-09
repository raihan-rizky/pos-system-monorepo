import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionCountMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  requireRole: vi.fn(),
  handleAuthError: handleAuthErrorMock,
  AuthError: class AuthError extends Error {
    public statusCode: number;
    constructor(statusCode: number, message?: string) {
      super(message || "auth");
      this.statusCode = statusCode;
    }
  },
}));

vi.mock("@pos/db", () => ({
  db: {
    transaction: {
      count: transactionCountMock,
      findMany: transactionFindManyMock,
    },
  },
  Prisma: {},
}));

vi.mock("@/features/transaction-history/helpers/fetch-transactions", () => ({
  fetchTransactionsAndCount: async (input: {
    count: () => Promise<number>;
    findMany: () => Promise<unknown[]>;
  }) => ({
    total: await input.count(),
    items: await input.findMany(),
  }),
}));

describe("GET /api/transactions surat jalan history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      role: "OWNER",
      storeId: "store-main",
      name: "Owner One",
    });
    handleAuthErrorMock.mockReturnValue(null);
    transactionCountMock.mockResolvedValue(1);
    transactionFindManyMock.mockResolvedValue([
      {
        id: "txn-1",
        invoiceNumber: "INV-001",
        draftNumber: null,
        items: [
          { id: "item-1", productId: "product-1", quantity: 6 },
          { id: "item-2", productId: "product-2", quantity: 4 },
          { id: "service-1", productId: null, quantity: 1 },
        ],
        suratJalan: [
          {
            id: "sj-1",
            status: "CONFIRMED",
            items: [{ quantity: 3 }, { quantity: 4 }],
          },
          {
            id: "sj-2",
            status: "PENDING",
            items: [{ quantity: 2 }],
          },
        ],
      },
    ]);
  });

  it("filters bundled transactions and returns lightweight surat jalan summary", async () => {
    const { GET } = await import("../route");

    const response = await GET(
      new Request("http://localhost/api/transactions?suratJalan=bundled"),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(transactionCountMock).toHaveBeenCalledWith({
      where: {
        storeId: "store-main",
        AND: [{ suratJalan: { some: {} } }],
      },
    });
    expect(transactionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          suratJalan: expect.any(Object),
        }),
      }),
    );
    expect(json.data[0]).not.toHaveProperty("suratJalan");
    expect(json.data[0].suratJalanSummary).toEqual({
      count: 2,
      confirmedCount: 1,
      pendingCount: 1,
      deliveredQuantity: 7,
      totalQuantity: 10,
    });
  }, 30000);

  it("filters transaction history by customer type", async () => {
    const { GET } = await import("../route");

    const response = await GET(
      new Request("http://localhost/api/transactions?status=DEBT_HISTORY&customerType=AGEN"),
    );

    expect(response.status).toBe(200);
    expect(transactionCountMock).toHaveBeenCalledWith({
      where: {
        storeId: "store-main",
        AND: [
          {
            OR: [
              { status: "DP" },
              {
                status: "COMPLETED",
                debtPaymentLogs: { some: {} },
              },
            ],
          },
          { customer: { type: "AGEN" } },
        ],
      },
    });
    expect(transactionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId: "store-main",
          AND: [
            {
              OR: [
                { status: "DP" },
                {
                  status: "COMPLETED",
                  debtPaymentLogs: { some: {} },
                },
              ],
            },
            { customer: { type: "AGEN" } },
          ],
        },
      }),
    );
  });

  it("filters and orders history by invoiceDate business date", async () => {
    const { GET } = await import("../route");

    const response = await GET(
      new Request(
        "http://localhost/api/transactions?dateFrom=2026-07-01&dateTo=2026-07-02",
      ),
    );

    expect(response.status).toBe(200);
    expect(transactionCountMock).toHaveBeenCalledWith({
      where: {
        storeId: "store-main",
        AND: [
          {
            invoiceDate: {
              gte: new Date("2026-06-30T17:00:00.000Z"),
              lt: new Date("2026-07-02T17:00:00.000Z"),
            },
          },
        ],
      },
    });
    expect(transactionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { invoiceDate: "desc" },
      }),
    );
  });

  it("returns the latest invoice date change summary for history rows", async () => {
    transactionFindManyMock.mockResolvedValueOnce([
      {
        id: "txn-1",
        invoiceNumber: "INV-20260708-0001",
        draftNumber: null,
        items: [],
        suratJalan: [],
        invoiceDateChangeLogs: [
          {
            id: "change-1",
            oldInvoiceDate: new Date("2026-07-09T03:15:00.000Z"),
            newInvoiceDate: new Date("2026-07-08T03:15:00.000Z"),
            oldDocumentNumber: "INV-20260709-0001",
            newDocumentNumber: "INV-20260708-0001",
            reason: "Invoice seharusnya masuk transaksi kemarin.",
            actorName: "Owner One",
            actorRole: "OWNER",
            createdAt: new Date("2026-07-09T05:00:00.000Z"),
          },
        ],
      },
    ]);

    const { GET } = await import("../route");

    const response = await GET(new Request("http://localhost/api/transactions"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(transactionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          invoiceDateChangeLogs: expect.objectContaining({
            take: 1,
            orderBy: { createdAt: "desc" },
          }),
        }),
      }),
    );
    expect(json.data[0]).not.toHaveProperty("invoiceDateChangeLogs");
    expect(json.data[0].latestInvoiceDateChange).toEqual({
      id: "change-1",
      oldInvoiceDate: "2026-07-09T03:15:00.000Z",
      newInvoiceDate: "2026-07-08T03:15:00.000Z",
      oldDocumentNumber: "INV-20260709-0001",
      newDocumentNumber: "INV-20260708-0001",
      reason: "Invoice seharusnya masuk transaksi kemarin.",
      actorName: "Owner One",
      actorRole: "OWNER",
      createdAt: "2026-07-09T05:00:00.000Z",
    });
  });

  it("includes walk-in transactions in the UMUM customer type filter", async () => {
    const { GET } = await import("../route");

    const response = await GET(
      new Request("http://localhost/api/transactions?status=DEBT_HISTORY&customerType=UMUM"),
    );

    expect(response.status).toBe(200);
    expect(transactionCountMock).toHaveBeenCalledWith({
      where: {
        storeId: "store-main",
        AND: [
          {
            OR: [
              { status: "DP" },
              {
                status: "COMPLETED",
                debtPaymentLogs: { some: {} },
              },
            ],
          },
          {
            OR: [{ customer: { type: "UMUM" } }, { customerId: null }],
          },
        ],
      },
    });
    expect(transactionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId: "store-main",
          AND: [
            {
              OR: [
                { status: "DP" },
                {
                  status: "COMPLETED",
                  debtPaymentLogs: { some: {} },
                },
              ],
            },
            {
              OR: [{ customer: { type: "UMUM" } }, { customerId: null }],
            },
          ],
        },
      }),
    );
  });
});
