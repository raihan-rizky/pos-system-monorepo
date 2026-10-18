import { beforeEach, describe, expect, it, vi } from "vitest";
import { netInitialPayments } from "@/features/customer-debt/helpers/net-initial-payments";

const afterMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/invoice-date/services/internet-clock", () => ({ getInvoiceNow: async () => new Date() }));
const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionUpdateManyMock = vi.hoisted(() => vi.fn());
const transactionUpdateMock = vi.hoisted(() => vi.fn());
const transactionCountMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const productUpdateManyMock = vi.hoisted(() => vi.fn());
const queryRawMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateManyMock = vi.hoisted(() => vi.fn());
const transactionPaymentDeleteManyMock = vi.hoisted(() => vi.fn());
const transactionPaymentCreateManyMock = vi.hoisted(() => vi.fn());
const customerUpdateMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const buildApprovalQuoteMock = vi.hoisted(() => vi.fn());
const canRolePerformActionMock = vi.hoisted(() => vi.fn());
const getGlobalRolePermissionsMock = vi.hoisted(() => vi.fn());

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
    transactionPayment: {
      deleteMany: transactionPaymentDeleteManyMock,
      createMany: transactionPaymentCreateManyMock,
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

vi.mock("@/features/transactions-draft/services/approval-quote", () => ({
  buildApprovalQuote: buildApprovalQuoteMock,
}));

vi.mock("@/features/rbac/helpers/rbac-core", () => ({
  buildDefaultRolePermissions: vi.fn(() => ({})),
  canRolePerformAction: canRolePerformActionMock,
}));

vi.mock("@/features/rbac/helpers/rbac-server", () => ({
  getGlobalRolePermissions: getGlobalRolePermissionsMock,
}));

const draftRow = {
  id: "draft-1",
  invoiceNumber: null,
  draftNumber: "DRAFT-20260520-0001",
  invoiceDate: new Date("2026-05-20T03:00:00.000Z"),
  storeId: "store-main",
  status: "DRAFT" as const,
  tax: 0,
  taxRate: null,
  taxMethod: "STANDARD",
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
  it("persists the DPP basis when approving a legacy quote without editing its tax", async () => {
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft-1/approve-draft", {
      method: "POST", body: JSON.stringify({ paymentMethod: "CASH", amountPaid: 100000 }),
    }), { params: Promise.resolve({ id: "draft-1" }) });
    expect(response.status).toBe(200);
    expect(transactionUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ taxMethod: "DPP_NILAI_LAIN" }),
    }));
  });
  it("rejects approval if tax changed after the quote was checked", async () => {
    transactionUpdateManyMock.mockImplementation(async ({ where }) => ({ count: where.tax === 0 && where.total === 100000 && where.taxRate === null ? 0 : 1 }));
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft-1/approve-draft", {
      method: "POST", body: JSON.stringify({ paymentMethod: "CASH", amountPaid: 100000 }),
    }), { params: Promise.resolve({ id: "draft-1" }) });
    expect(response.status).toBe(409);
    expect(transactionPaymentCreateManyMock).not.toHaveBeenCalled();
  });
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
    transactionUpdateMock.mockResolvedValue({ ...draftRow, items: draftRow.items });
    productFindManyMock.mockImplementation(async ({ where }) =>
      where.id.in.map((id: string) => ({
        id,
        stock: 100,
        stockGroupId: null,
        unitMultiplierToBase: 1,
        conversionNeedsReview: false,
        stockGroup: null,
      })),
    );
    productUpdateManyMock.mockResolvedValue({ count: 1 });
    queryRawMock.mockImplementation(
      async (_strings: TemplateStringsArray, rowId: string) => [{ id: rowId }],
    );
    inventoryLogCreateManyMock.mockResolvedValue({ count: 2 });
    customerUpdateMock.mockResolvedValue({});
    transactionPaymentDeleteManyMock.mockResolvedValue({ count: 0 });
    transactionPaymentCreateManyMock.mockResolvedValue({ count: 1 });
    buildApprovalQuoteMock.mockReset();
    buildApprovalQuoteMock.mockImplementation(async (_tx: unknown, input: any) => ({
      items: input.items.map((item: any) => ({
        input: item,
        name: "Produk",
        unit: "pcs",
        modal: null,
        unitCost: null,
        rawMaterialUnitCost: null,
        regular: 50000,
        agent: null,
        government: null,
        special: null,
        appliedUnitPrice: 50000,
        subtotal: item.quantity * 50000,
        appliedPricing: null,
      })),
      subtotal: 100000,
      discount: 0,
      tax: 0,
      total: 100000,
      fingerprint: "fresh-quote",
    }));
    canRolePerformActionMock.mockReturnValue(false);
    getGlobalRolePermissionsMock.mockResolvedValue({});
    dbTransactionMock.mockImplementation(async (callback: any) =>
      callback({
        transaction: {
          updateMany: transactionUpdateManyMock,
          count: transactionCountMock,
          update: transactionUpdateMock,
        },
        transactionPayment: {
          deleteMany: transactionPaymentDeleteManyMock,
          createMany: transactionPaymentCreateManyMock,
        },
        inventoryLog: { createMany: inventoryLogCreateManyMock },
        customer: { update: customerUpdateMock },
        product: {
          findMany: productFindManyMock,
          updateMany: productUpdateManyMock,
        },
        $queryRaw: queryRawMock,
      }),
    );
  });

  it("flips DRAFT → COMPLETED, mints invoiceNumber, preserves draftNumber, decrements stock", async () => {
    afterMock.mockImplementation(() => undefined);
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft-1/approve-draft", {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "CASH", amountPaid: 100000 }),
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    );
    expect(customerUpdateMock).toHaveBeenCalledTimes(1);
    expect(customerUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(transactionUpdateManyMock.mock.invocationCallOrder[0]);

    expect(res.status).toBe(200);
    expect(dbTransactionMock).toHaveBeenCalledWith(
      expect.any(Function),
      { maxWait: 5_000, timeout: 30_000 },
    );
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
    expect(queryRawMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    { label: "cash", payments: undefined },
    { label: "split tender", payments: [{ method: "TRANSFER", amount: 80000 }, { method: "CASH", amount: 70000 }] },
  ])("records gross receipts and counts change once for $label overpayment", async ({ payments }) => {
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft-1/approve-draft", {
      method: "POST",
      body: JSON.stringify({ paymentMethod: "CASH", amountPaid: 150000, payments }),
    }), { params: Promise.resolve({ id: "draft-1" }) });

    expect(response.status).toBe(200);
    const header = transactionUpdateManyMock.mock.calls[0][0].data;
    const rows = transactionPaymentCreateManyMock.mock.calls[0][0].data;
    expect(netInitialPayments(rows, header).reduce((sum, row) => sum + row.amount, 0)).toBe(100000);
    expect(header).toMatchObject({ amountPaid: 150000, change: 50000 });
    expect(rows.reduce((sum: number, row: { amount: number }) => sum + row.amount, 0)).toBe(150000);
    expect(customerUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalSpent: { increment: 100000 } }) }));
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
    productUpdateManyMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
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

  it("rejects a stale editable quote before changing status or stock", async () => {
    buildApprovalQuoteMock.mockResolvedValue({
      items: [],
      subtotal: 100000,
      discount: 0,
      tax: 0,
      total: 100000,
      fingerprint: "fresh-quote",
    });

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft-1/approve-draft", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "CASH",
          amountPaid: 100000,
          items: [{ productId: "p1", quantity: 3 }],
          quoteFingerprint: "stale-quote",
        }),
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    );

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("APPROVAL_QUOTE_CHANGED");
    expect(transactionUpdateManyMock).not.toHaveBeenCalled();
    expect(productUpdateManyMock).not.toHaveBeenCalled();
  });

  it("allows a zero-payment Tempo approval only for a customer and records the full receivable", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft-1/approve-draft", {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "TEMPO", amountPaid: 0 }),
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    );

    expect(res.status).toBe(200);
    expect(transactionUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "COMPLETED",
          paymentMethod: "TEMPO",
          amountPaid: 0,
        }),
      }),
    );
    expect(customerUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "customer-1" },
        data: expect.objectContaining({ totalDebt: { increment: 100000 } }),
      }),
    );
  });

  it("requires a customer for Tempo before mutating a draft", async () => {
    transactionFindFirstMock.mockResolvedValue({ ...draftRow, customerId: null });
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft-1/approve-draft", {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "TEMPO", amountPaid: 0 }),
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    );

    expect(res.status).toBe(422);
    expect((await res.json()).message).toMatch(/pelanggan/i);
    expect(transactionUpdateManyMock).not.toHaveBeenCalled();
    expect(productUpdateManyMock).not.toHaveBeenCalled();
  });

  it("records actual tender rows for a partially paid Tempo approval", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft-1/approve-draft", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "TEMPO",
          amountPaid: 25000,
          payments: [{ method: "CASH", amount: 25000 }],
        }),
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    );

    expect(res.status).toBe(200);
    expect(transactionPaymentDeleteManyMock).toHaveBeenCalledWith({
      where: { transactionId: "draft-1" },
    });
    expect(transactionPaymentCreateManyMock).toHaveBeenCalledWith({
      data: [{ transactionId: "draft-1", method: "CASH", amount: 25000 }],
    });
    expect(customerUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalSpent: { increment: 25000 },
          totalDebt: { increment: 75000 },
        }),
      }),
    );
  });

  it("persists edited lines and journals product and raw-material stock inside approval", async () => {
    const quoteItem = {
      input: {
        productId: "p3",
        printingServiceId: "service-1",
        quantity: 3,
        rawMaterialProductId: "raw-1",
        rawMaterialQuantity: 2,
        material: "Glossy",
      },
      name: "Cetak",
      unit: "lembar",
      modal: null,
      unitCost: null,
      rawMaterialUnitCost: null,
      regular: 50000,
      agent: null,
      government: null,
      special: null,
      appliedUnitPrice: 50000,
      subtotal: 150000,
      appliedPricing: null,
    };
    buildApprovalQuoteMock.mockResolvedValue({
      items: [quoteItem],
      subtotal: 150000,
      discount: 0,
      tax: 0,
      total: 150000,
      fingerprint: "fresh-quote",
    });
    transactionUpdateMock.mockResolvedValue({
      ...draftRow,
      items: [{ id: "new-item", ...quoteItem.input }],
    });

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft-1/approve-draft", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "CASH",
          amountPaid: 100000,
          items: [quoteItem.input],
          quoteFingerprint: "fresh-quote",
        }),
      }),
      { params: Promise.resolve({ id: "draft-1" }) },
    );

    expect(res.status).toBe(200);
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "draft-1" },
        data: expect.objectContaining({
          items: { deleteMany: {}, create: [expect.objectContaining({ productId: "p3" })] },
        }),
      }),
    );
    const logRows = inventoryLogCreateManyMock.mock.calls[0]?.[0]?.data;
    expect(logRows).toHaveLength(2);
    expect(logRows.map((row: any) => row.transactionId)).toEqual([
      "draft-1",
      "draft-1",
    ]);
    expect(logRows.map((row: any) => row.stockBaseDelta)).toEqual([-3, -2]);
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
