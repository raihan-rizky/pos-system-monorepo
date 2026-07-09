import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const customerFindFirstMock = vi.hoisted(() => vi.fn());
const salespersonFindFirstMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const transactionCountMock = vi.hoisted(() => vi.fn());
const transactionCreateMock = vi.hoisted(() => vi.fn());
const productPriceLogCreateManyMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const canRolePerformActionMock = vi.hoisted(() => vi.fn());
const getGlobalRolePermissionsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  requireRole: requireRoleMock,
  handleAuthError: handleAuthErrorMock,
  AuthError: class AuthError extends Error {
    public statusCode: number;
    constructor(statusCode: number, message?: string) {
      super(message || "auth");
      this.statusCode = statusCode;
    }
  },
}));

vi.mock("@/features/rbac/helpers/rbac-core", () => ({
  canRolePerformAction: canRolePerformActionMock,
}));

vi.mock("@/features/rbac/helpers/rbac-server", () => ({
  getGlobalRolePermissions: getGlobalRolePermissionsMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    customer: { findFirst: customerFindFirstMock },
    salesperson: { findFirst: salespersonFindFirstMock },
    product: { findMany: productFindManyMock },
    transaction: {
      count: transactionCountMock,
      create: transactionCreateMock,
    },
    productPriceLog: { createMany: productPriceLogCreateManyMock },
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

describe("POST /api/transactions/draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T03:00:00.000Z"));
    requireRoleMock.mockResolvedValue({
      id: "cashier-1",
      role: "CASHIER",
      storeId: "store-main",
      name: "Cashier One",
    });
    handleAuthErrorMock.mockReturnValue(null);
    canRolePerformActionMock.mockReturnValue(true);
    getGlobalRolePermissionsMock.mockResolvedValue({});
    customerFindFirstMock.mockResolvedValue(null);
    salespersonFindFirstMock.mockResolvedValue(null);
    productFindManyMock.mockResolvedValue([
      {
        id: "p1",
        name: "Kertas A4",
        price: 50000,
        costPrice: 30000,
        size: null,
        material: null,
      },
    ]);
    transactionCountMock.mockResolvedValue(0);
    dbTransactionMock.mockImplementation(async (callback: any) =>
      callback({
        transaction: {
          create: transactionCreateMock,
        },
        productPriceLog: { createMany: productPriceLogCreateManyMock },
      }),
    );
    transactionCreateMock.mockImplementation(async ({ data }: any) => ({
      id: "draft-1",
      draftNumber: data.draftNumber,
      invoiceNumber: data.invoiceNumber,
      status: data.status,
      storeId: data.storeId,
      cashierId: data.cashierId,
      requestedById: data.requestedById,
      items: [
        {
          productId: "p1",
          productName: "Kertas A4",
          quantity: 2,
          unitPrice: 50000,
          subtotal: 100000,
        },
      ],
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a DRAFT row with PNW draftNumber, null invoiceNumber, no stock decrement", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { productId: "p1", name: "Kertas A4", price: 50000, quantity: 2 },
          ],
          discount: 0,
          isJobOrder: false,
        }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("DRAFT");
    expect(body.invoiceNumber).toBeNull();
    expect(body.draftNumber).toBe("PNW-TLD-20260602-001");
    expect(transactionCreateMock).toHaveBeenCalledTimes(1);
    const createArgs = transactionCreateMock.mock.calls[0][0];
    expect(createArgs.data.status).toBe("DRAFT");
    expect(createArgs.data.invoiceNumber).toBeNull();
    expect(createArgs.data.cashierId).toBe("cashier-1");
    expect(createArgs.data.requestedById).toBeNull();
  }, 30000);

  it("stores custom quote prices as item snapshots and writes audit-only price logs", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { productId: "p1", name: "Kertas A4", price: 47500, quantity: 3 },
          ],
          discount: 0,
          customerName: "PT Contoh",
          isJobOrder: false,
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect(transactionCreateMock).toHaveBeenCalledTimes(1);
    const createArgs = transactionCreateMock.mock.calls[0][0];
    expect(createArgs.data.subtotal).toBe(142500);
    expect(createArgs.data.total).toBe(142500);
    expect(createArgs.data.customerName).toBe("PT Contoh");
    expect(createArgs.data.items.create).toEqual([
      expect.objectContaining({
        productId: "p1",
        productName: "Kertas A4",
        quantity: 3,
        unitPrice: 47500,
        unitCost: 30000,
        subtotal: 142500,
      }),
    ]);
    expect(createArgs.data).not.toHaveProperty("price");
    expect(productPriceLogCreateManyMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          productId: "p1",
          storeId: "store-main",
          field: "PRICE",
          oldValue: "50000.00",
          newValue: "47500.00",
          source: "SYSTEM",
          note:
            "Harga khusus untuk nota penawaran dengan nomor 001/PNW-TLD/02/VI/2026",
          changedBy: "cashier-1",
          changedByName: "Cashier One",
        }),
      ],
    });
  }, 30000);

  it("returns 422 when cart is empty", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({ items: [], discount: 0, isJobOrder: false }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when a product id does not exist", async () => {
    productFindManyMock.mockResolvedValue([]);
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { productId: "missing", name: "x", price: 1, quantity: 1 },
          ],
          discount: 0,
          isJobOrder: false,
        }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("flags a SALES draft with requestedById and null cashierId", async () => {
    requireRoleMock.mockResolvedValue({
      id: "sales-1",
      role: "SALES",
      storeId: "store-main",
      name: "Sales One",
    });
    const { POST } = await import("../route");
    await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { productId: "p1", name: "Kertas A4", price: 50000, quantity: 2 },
          ],
          discount: 0,
          isJobOrder: false,
        }),
      }),
    );
    const createArgs = transactionCreateMock.mock.calls[0][0];
    expect(createArgs.data.cashierId).toBeNull();
    expect(createArgs.data.requestedById).toBe("sales-1");
  });

  it("lets OWNER create a draft with a custom invoice date and matching draft number date", async () => {
    requireRoleMock.mockResolvedValue({
      id: "owner-1",
      role: "OWNER",
      storeId: "store-main",
      name: "Owner One",
    });
    transactionCountMock.mockResolvedValue(4);
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { productId: "p1", name: "Kertas A4", price: 50000, quantity: 2 },
          ],
          discount: 0,
          isJobOrder: false,
          invoiceDate: "2026-07-01",
          invoiceTime: "14:05",
          invoiceDateReason: "Nota penawaran susulan dari arsip manual",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const createArgs = transactionCreateMock.mock.calls[0][0];
    expect(createArgs.data.invoiceDate.toISOString()).toBe(
      "2026-07-01T07:05:00.000Z",
    );
    expect(createArgs.data.draftNumber).toBe("PNW-TLD-20260701-005");
    expect(transactionCountMock).toHaveBeenCalledWith({
      where: {
        storeId: "store-main",
        draftNumber: { startsWith: "PNW-TLD-20260701-" },
      },
    });
  });

  it("rejects a custom invoice date from CASHIER when creating a draft", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { productId: "p1", name: "Kertas A4", price: 50000, quantity: 2 },
          ],
          discount: 0,
          isJobOrder: false,
          invoiceDate: "2026-07-01",
        }),
      }),
    );

    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.message).toBe(
      "Hanya Owner atau Admin yang boleh mengatur tanggal invoice.",
    );
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it("returns 403 when role lacks transaction.draft:create permission", async () => {
    canRolePerformActionMock.mockReturnValue(false);
    handleAuthErrorMock.mockImplementation((err: any) => {
      if (err && err.statusCode === 403) {
        return new Response(JSON.stringify({ message: "Forbidden" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return null;
    });
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { productId: "p1", name: "Kertas A4", price: 50000, quantity: 2 },
          ],
          discount: 0,
          isJobOrder: false,
        }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
