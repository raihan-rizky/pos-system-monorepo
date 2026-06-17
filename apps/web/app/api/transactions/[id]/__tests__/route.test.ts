import { beforeEach, describe, expect, it, vi } from "vitest";

const afterMock = vi.hoisted(() => vi.fn());
const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());

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
    },
  },
  Prisma: {},
}));

import { GET } from "../route";

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
      createdAt: transactionCreatedAt,
      cashier: { name: "Cashier One" },
      salesperson: null,
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
    expect(body.createdAt).toBe("2026-06-16T08:30:00.000Z");
    expect(body.updatedAt).toBeUndefined();
    expect(body.items[0].createdAt).toBe("2026-06-16T08:30:00.000Z");
  });
});
