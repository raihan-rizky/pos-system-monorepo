import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindUniqueMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const customerFindFirstMock = vi.hoisted(() => vi.fn());
const salespersonFindFirstMock = vi.hoisted(() => vi.fn());
const pricingRuleFindManyMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const transactionCountMock = vi.hoisted(() => vi.fn());
const transactionCreateMock = vi.hoisted(() => vi.fn());
const productCostFindManyMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateManyMock = vi.hoisted(() => vi.fn());
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
    categoryCustomerPricingRule: { findMany: pricingRuleFindManyMock },
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
    pricingRuleFindManyMock.mockResolvedValue([]);
    transactionCountMock.mockResolvedValue(0);
    transactionCreateMock.mockResolvedValue({ id: "tx-1" });
    productCostFindManyMock.mockResolvedValue([
      { id: "product-1", costPrice: 500 },
    ]);
    inventoryLogCreateManyMock.mockResolvedValue({ count: 1 });
    dbTransactionMock.mockImplementation(async (callback: any) =>
      callback({
        transaction: {
          count: transactionCountMock,
          create: transactionCreateMock,
        },
        product: { findMany: productCostFindManyMock },
        inventoryLog: { createMany: inventoryLogCreateManyMock },
      }),
    );
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

  function setupAgenPricing() {
    customerFindFirstMock.mockResolvedValue({
      id: "agen-1",
      type: "AGEN",
    });
    productFindManyMock.mockResolvedValue([
      {
        id: "product-1",
        name: "Pulpen",
        price: 100000,
        costPrice: 50000,
        hargaAgen: 95000,
        hargaDinas: null,
        size: null,
        material: null,
        stock: 10,
        unit: "pcs",
        categoryId: "cat-atk",
        category: { name: "ATK" },
        brandId: null,
        brand: null,
      },
    ]);
    productCostFindManyMock.mockResolvedValue([
      { id: "product-1", costPrice: 50000 },
    ]);
    pricingRuleFindManyMock.mockResolvedValue([
      {
        id: "rule-atk",
        categoryId: "cat-atk",
        customerType: null,
        unit: null,
        brandId: null,
        brand: null,
        mode: "PERCENT_DISCOUNT",
        value: 10,
        isActive: true,
        updatedAt: new Date("2026-07-03T00:00:00.000Z"),
        category: { name: "ATK" },
      },
    ]);
  }

  it("syncs queued SPECIAL preference with matching Harga Khusus", async () => {
    setupAgenPricing();

    const response = await POST(
      request([
        offlineTx({
          createdAt: new Date().toISOString(),
          customerId: "agen-1",
          pricingPreference: "SPECIAL",
          items: [
            {
              productId: "product-1",
              name: "Pulpen",
              price: 90000,
              quantity: 1,
            },
          ],
          amountPaid: 90000,
          originalSubtotal: 90000,
          originalTotal: 90000,
        }),
      ]),
    );

    expect(response.status).toBe(200);
    const createArgs = transactionCreateMock.mock.calls[0][0];
    expect(createArgs.data.items.create[0]).toEqual(
      expect.objectContaining({
        unitPrice: 90000,
        pricingRuleId: "rule-atk",
        originalUnitPrice: 100000,
        appliedUnitPrice: 90000,
      }),
    );
  });

  it("syncs queued MEMBER preference with Harga Agen", async () => {
    setupAgenPricing();

    const response = await POST(
      request([
        offlineTx({
          createdAt: new Date().toISOString(),
          customerId: "agen-1",
          pricingPreference: "MEMBER",
          items: [
            {
              productId: "product-1",
              name: "Pulpen",
              price: 95000,
              quantity: 1,
            },
          ],
          amountPaid: 95000,
          originalSubtotal: 95000,
          originalTotal: 95000,
        }),
      ]),
    );

    expect(response.status).toBe(200);
    const createArgs = transactionCreateMock.mock.calls[0][0];
    expect(createArgs.data.items.create[0]).toEqual(
      expect.objectContaining({
        unitPrice: 95000,
        pricingRuleId: "harga-agen",
      }),
    );
  });
});
