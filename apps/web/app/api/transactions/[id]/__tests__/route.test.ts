import { beforeEach, describe, expect, it, vi } from "vitest";

const afterMock = vi.hoisted(() => vi.fn());
const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionUpdateMock = vi.hoisted(() => vi.fn());

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: afterMock };
});

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/product-stock-groups/stock-mutations", () => ({
  applyProductStockDeltas: vi.fn(),
}));

vi.mock("@pos/db", () => ({
  db: {
    transaction: {
      findFirst: transactionFindFirstMock,
      update: transactionUpdateMock,
    },
  },
  Prisma: {},
}));

import { GET, PATCH } from "../route";

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
