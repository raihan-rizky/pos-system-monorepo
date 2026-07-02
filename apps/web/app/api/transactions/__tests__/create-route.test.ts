import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const afterMock = vi.hoisted(() => vi.fn());
const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const applyProductStockDeltasMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: afterMock };
});

vi.mock("@/lib/rbac/guard", () => ({
  requireRole: requireRoleMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/rbac/helpers/rbac-server", () => ({
  getGlobalRolePermissions: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/rbac/helpers/rbac-core", () => ({
  canRolePerformAction: vi.fn().mockReturnValue(true),
}));

vi.mock("@/features/pos-checkout/post-commit", () => ({
  buildInventoryLogRows: vi.fn().mockReturnValue([]),
  buildCustomerUpdateArgs: vi.fn().mockReturnValue(null),
  buildServiceMaterialInventoryLogRows: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/push-events", () => ({
  sendRolePushEvent: vi.fn(),
}));

vi.mock("@/features/product-stock-groups/stock-mutations", () => ({
  applyProductStockDeltas: applyProductStockDeltasMock,
  StockMutationError: class StockMutationError extends Error {
    constructor(message: string, public readonly details?: unknown) {
      super(message);
    }
  },
}));

vi.mock("@pos/db", () => ({
  db: {
    customer: { findFirst: vi.fn().mockResolvedValue(true) },
    salesperson: { findFirst: vi.fn().mockResolvedValue(true) },
    product: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "p1",
          name: "Item 1",
          price: "1000",
          costPrice: "500",
          stock: -5,
          unit: "pcs",
          categoryId: "cat1",
          category: { name: "CAT1" },
        },
      ]),
    },
    categoryCustomerPricingRule: { findMany: vi.fn().mockResolvedValue([]) },
    transaction: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "tx-1", status: "COMPLETED" }),
    },
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

describe("POST /api/transactions negative stock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterMock.mockImplementation((cb: any) => cb());
    requireRoleMock.mockResolvedValue({
      id: "u1",
      role: "CASHIER",
      storeId: "store-1",
      name: "Cashier",
    });
    handleAuthErrorMock.mockReturnValue(null);
    dbTransactionMock.mockImplementation(async (cb: any) => cb({
      transaction: { create: vi.fn().mockResolvedValue({ id: "tx-1", status: "COMPLETED" }) },
      transactionItemSnapshot: { createMany: vi.fn() },
      inventoryLog: { createMany: vi.fn() },
      customer: { update: vi.fn() },
    }));
  });

  it("passes allowNegative: true to applyProductStockDeltas to permit negative checkout", async () => {
    applyProductStockDeltasMock.mockResolvedValue([]);

    const req = new Request("http://localhost/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        paymentMethod: "CASH",
        amountPaid: 2000,
        discount: 0,
        note: "",
        customerName: "Umum",
        customerId: null,
        salesName: "",
        salespersonId: "",
        paymentStatus: "COMPLETED",
        isJobOrder: false,
        estimatedDoneAt: null,
        items: [
          {
            cartLineId: "c1",
            lineType: "PRODUCT",
            productId: "p1",
            quantity: 2,
            price: 1000,
            costPrice: 500,
            unit: "pcs",
            categoryId: "cat1",
            name: "Item 1",
          },
        ],
      }),
    });

    const res = await POST(req);
    const body = await res.json();
    if (res.status !== 201) {
      console.log("Error body:", body);
    }
    expect(res.status).toBe(201);
    expect(applyProductStockDeltasMock).toHaveBeenCalledTimes(1);
    
    const args = applyProductStockDeltasMock.mock.calls[0][1];
    expect(args.allowNegative).toBe(true);
  });
});