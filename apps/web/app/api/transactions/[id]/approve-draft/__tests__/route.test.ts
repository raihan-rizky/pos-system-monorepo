import { beforeEach, describe, expect, it, vi } from "vitest";

const afterMock = vi.hoisted(() => vi.fn());
const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionUpdateManyMock = vi.hoisted(() => vi.fn());
const transactionCountMock = vi.hoisted(() => vi.fn());
const queryRawMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateManyMock = vi.hoisted(() => vi.fn());
const customerUpdateMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: afterMock };
});

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
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
      findFirst: transactionFindFirstMock,
      count: transactionCountMock,
    },
    inventoryLog: { createMany: inventoryLogCreateManyMock },
    customer: { update: customerUpdateMock },
    $transaction: dbTransactionMock,
  },
  Prisma: {
    empty: "",
    sql: vi.fn().mockReturnValue(""),
  },
}));

const draftRow = {
  id: "draft-1",
  invoiceNumber: null,
  draftNumber: "DRAFT-20260520-0001",
  invoiceDate: new Date("2026-05-20T03:00:00.000Z"),
  storeId: "store-main",
  status: "DRAFT" as const,
  total: 100000,
  customerId: "customer-1",
  cashierId: "cashier-1",
  requestedById: null,
  items: [
    { productId: "p1", quantity: 2 },
    { productId: "p2", quantity: 1 },
  ],
};

describe("POST /api/transactions/[id]/approve-draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterMock.mockImplementation((cb: () => void | Promise<void>) => cb());
    requirePermissionMock.mockResolvedValue({
      id: "cashier-1",
      role: "CASHIER",
      storeId: "store-main",
      name: "Cashier One",
    });
    handleAuthErrorMock.mockReturnValue(null);
    transactionFindFirstMock.mockResolvedValue({ ...draftRow });
    transactionCountMock.mockResolvedValue(0);
    transactionUpdateManyMock.mockResolvedValue({ count: 1 });
    queryRawMock.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    inventoryLogCreateManyMock.mockResolvedValue({ count: 2 });
    customerUpdateMock.mockResolvedValue({});
    dbTransactionMock.mockImplementation(async (callback: any) =>
      callback({
        transaction: {
          updateMany: transactionUpdateManyMock,
          count: transactionCountMock,
        },
        $queryRaw: queryRawMock,
      }),
    );
  });

  it("flips DRAFT → COMPLETED, mints invoiceNumber, preserves draftNumber, decrements stock", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft-1/approve-draft", {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "CASH", amountPaid: 100000 }),
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("COMPLETED");
    expect(body.invoiceNumber).toMatch(/^INV-\d{8}-\d{4}$/);
    expect(body.draftNumber).toBe("DRAFT-20260520-0001");
    expect(transactionUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "draft-1",
          storeId: "store-main",
          status: "DRAFT",
        }),
      }),
    );
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });

  it("returns 409 when the row is no longer DRAFT", async () => {
    transactionFindFirstMock.mockResolvedValue({
      ...draftRow,
      status: "COMPLETED",
    });
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft-1/approve-draft", {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "CASH", amountPaid: 100000 }),
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    );
    expect(res.status).toBe(409);
  });

  it("returns 409 with stock-kurang message when atomic stock decrement is short", async () => {
    queryRawMock.mockResolvedValue([{ id: "p1" }]); // only 1 of 2 rows decremented
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft-1/approve-draft", {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "CASH", amountPaid: 100000 }),
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toMatch(/stok/i);
  });

  it("returns 403 when SALES tries to approve a SALES-created draft", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "sales-2",
      role: "SALES",
      storeId: "store-main",
      name: "Sales Two",
    });
    transactionFindFirstMock.mockResolvedValue({
      ...draftRow,
      cashierId: null,
      requestedById: "sales-1",
    });
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
      new Request("http://localhost/api/transactions/draft-1/approve-draft", {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "CASH", amountPaid: 100000 }),
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("allows CASHIER to self-approve their own draft", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "cashier-1",
      role: "CASHIER",
      storeId: "store-main",
      name: "Cashier One",
    });
    transactionFindFirstMock.mockResolvedValue({
      ...draftRow,
      cashierId: "cashier-1",
      requestedById: null,
    });
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft-1/approve-draft", {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "CASH", amountPaid: 100000 }),
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    );
    expect(res.status).toBe(200);
  });

  it("mints the final invoice number from the draft invoiceDate", async () => {
    transactionFindFirstMock.mockResolvedValue({
      ...draftRow,
      draftNumber: "PNW-TLD-20260701-005",
      invoiceDate: new Date("2026-07-01T07:05:00.000Z"),
    });
    transactionCountMock.mockResolvedValue(4);

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft-1/approve-draft", {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "CASH", amountPaid: 100000 }),
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invoiceNumber).toBe("INV-20260701-0005");
    expect(transactionCountMock).toHaveBeenCalledWith({
      where: {
        storeId: "store-main",
        invoiceNumber: { startsWith: "INV-20260701-" },
      },
    });
  });

  it("lets OWNER override invoiceDate during draft approval", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      role: "OWNER",
      storeId: "store-main",
      name: "Owner One",
    });
    transactionCountMock.mockResolvedValue(2);

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft-1/approve-draft", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "CASH",
          amountPaid: 100000,
          invoiceDate: "2026-07-02",
          invoiceTime: "16:30",
          invoiceDateReason: "Approval nota susulan",
        }),
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invoiceNumber).toBe("INV-20260702-0003");
    expect(body.invoiceDate).toBe("2026-07-02T09:30:00.000Z");
    expect(transactionUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceDate: new Date("2026-07-02T09:30:00.000Z"),
        }),
      }),
    );
  });
});
