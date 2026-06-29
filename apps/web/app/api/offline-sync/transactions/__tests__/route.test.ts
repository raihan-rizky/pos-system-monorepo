import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindUniqueMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const customerFindFirstMock = vi.hoisted(() => vi.fn());
const salespersonFindFirstMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const applyProductStockDeltasMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/product-stock-groups/stock-mutations", () => ({
  applyProductStockDeltas: applyProductStockDeltasMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    transaction: { findUnique: transactionFindUniqueMock },
    product: { findMany: productFindManyMock },
    customer: { findFirst: customerFindFirstMock },
    salesperson: { findFirst: salespersonFindFirstMock },
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

function offlineTx(overrides: Record<string, unknown> = {}) {
  return {
    clientMutationId: "offline-1",
    createdAt: "2026-06-22T08:00:00.000Z",
    items: [
      {
        productId: "product-1",
        name: "Product 1",
        price: 1000,
        quantity: 2,
      },
    ],
    paymentMethod: "CASH",
    amountPaid: 2000,
    discount: 0,
    originalSubtotal: 2000,
    originalTotal: 2000,
    ...overrides,
  };
}

function request(transactions: unknown[]) {
  return new Request("http://localhost/api/offline-sync/transactions", {
    method: "POST",
    body: JSON.stringify({ transactions }),
  });
}

describe("POST /api/offline-sync/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "cashier-1",
      name: "Cashier One",
      role: "CASHIER",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    transactionFindUniqueMock.mockResolvedValue(null);
    productFindManyMock.mockResolvedValue([
      {
        id: "product-1",
        name: "Product 1",
        price: 1000,
        size: null,
        material: null,
        stock: 10,
      },
    ]);
    customerFindFirstMock.mockResolvedValue(null);
    salespersonFindFirstMock.mockResolvedValue(null);
    dbTransactionMock.mockResolvedValue({ id: "tx-1" });
    applyProductStockDeltasMock.mockResolvedValue([]);
  });

  it("returns a per-transaction SYNCED result when create hits a duplicate mutation id race", async () => {
    // First read sees no existing row; create then loses the unique-key race;
    // re-fetch finds the row created by the winner.
    transactionFindUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "tx-race", status: "COMPLETED" });
    dbTransactionMock.mockRejectedValueOnce({ code: "P2002" });

    const response = await POST(request([offlineTx()]));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([
      {
        clientMutationId: "offline-1",
        status: "SYNCED",
        serverTransactionId: "tx-race",
        message: "Already synced",
      },
    ]);
  });

  it("keeps later batch items reportable when one item fails with a final error", async () => {
    productFindManyMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "product-1",
          name: "Product 1",
          price: 1000,
          size: null,
          material: null,
          stock: 10,
        },
      ]);
    dbTransactionMock.mockResolvedValueOnce({ id: "tx-2" });

    const response = await POST(request([
      offlineTx({ clientMutationId: "missing-product", items: [{ productId: "missing", name: "Missing", price: 1000, quantity: 1 }] }),
      offlineTx({ clientMutationId: "offline-2" }),
    ]));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([
      {
        clientMutationId: "missing-product",
        status: "FAILED_FINAL",
        message: "One or more products were not found",
      },
      {
        clientMutationId: "offline-2",
        status: "PENDING_APPROVAL",
        serverTransactionId: "tx-2",
        message: "Synced as pending approval",
      },
    ]);
  });
});
