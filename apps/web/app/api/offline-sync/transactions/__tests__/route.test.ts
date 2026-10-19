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
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const transactionCreateMock = vi.hoisted(() => vi.fn());
const productCostFindManyMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateManyMock = vi.hoisted(() => vi.fn());
const applyProductStockDeltasMock = vi.hoisted(() => vi.fn());
const customerUpdateMock = vi.hoisted(() => vi.fn());

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
  it("persists queued item discounts before invoice discount and tax", async () => {
    const response = await POST(request([offlineTx({ createdAt: new Date().toISOString(), items: [{ productId: "product-1", name: "Produk", price: 1000, quantity: 2, discount: 500 }], discount: 200, taxRate: 10, originalSubtotal: 1500, originalTotal: 1430, amountPaid: 1430 })]));
    expect(response.status).toBe(200);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ subtotal: 1500, discount: 200, tax: 130, total: 1430, status: "COMPLETED", items: { create: [{ unitPrice: 1000, discount: 500, subtotal: 1500 }] } });
  });
  it("caps saved discounts after canonical pricing shrinks the offline line", async () => {
    productFindManyMock.mockResolvedValue([{ id: "product-1", name: "Produk", price: 100, stock: 10 }]);
    await POST(request([offlineTx({ createdAt: new Date().toISOString(), items: [{ productId: "product-1", name: "Produk", price: 1000, quantity: 2, discount: 500 }], discount: 200, originalSubtotal: 1500, originalTotal: 1300 })]));
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ subtotal: 0, discount: 0, total: 0, status: "PENDING_APPROVAL", items: { create: [{ unitPrice: 100, discount: 200, subtotal: 0 }] } });
  });
  it("caps discounts after stock adjustment and retains approval metadata", async () => {
    productFindManyMock.mockResolvedValue([{ id: "product-1", name: "Produk", price: 1000, stock: 1 }]);
    await POST(request([offlineTx({ createdAt: new Date().toISOString(), items: [{ productId: "product-1", name: "Produk", price: 1000, quantity: 2, discount: 1500 }], discount: 100, taxRate: 10, originalSubtotal: 500, originalTotal: 440 })]));
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ subtotal: 0, discount: 0, tax: 0, total: 0, status: "PENDING_APPROVAL", items: { create: [{ quantity: 1, discount: 1000, subtotal: 0 }] }, offlineSyncMetadata: { reason: "ADJUSTED_TOTAL_CHANGED", originalTotal: 440, adjustedTotal: 0 } });
  });
  it.each([-1, "500", null])("rejects invalid queued item discount %s", async (discount) => {
    const response = await POST(request([offlineTx({ items: [{ productId: "product-1", name: "Produk", price: 1000, quantity: 2, discount }] })]));
    expect(response.status).toBe(422);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });
  it("preserves the checkout tax when syncing a current offline sale", async () => {
    const response = await POST(request([offlineTx({ createdAt: new Date().toISOString(), taxRate: 12.5, discount: 200, originalTotal: 2025, amountPaid: 2025 })]));
    expect(response.status).toBe(200);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ subtotal: 2000, discount: 200, taxRate: 12.5, taxMethod: "STANDARD", tax: 225, total: 2025, status: "COMPLETED" });
  });
  it("records customer contribution atomically for a completed offline sale", async () => {
    customerFindFirstMock.mockResolvedValue({ id: "c1", type: "UMUM" });
    applyProductStockDeltasMock.mockResolvedValue([]);
    await POST(request([offlineTx({ customerId: "c1", createdAt: new Date().toISOString() })]));
    expect(customerUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalOrders: { increment: 1 }, totalSpent: { increment: 2000 } }) }));
    expect(customerUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(transactionCreateMock.mock.invocationCallOrder[0]);
  });
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
    transactionFindManyMock.mockReset().mockResolvedValue([]);
    transactionCreateMock.mockResolvedValue({ id: "tx-1" });
    productCostFindManyMock.mockResolvedValue([
      { id: "product-1", costPrice: 500 },
    ]);
    inventoryLogCreateManyMock.mockResolvedValue({ count: 1 });
    dbTransactionMock.mockImplementation(async (callback: any) =>
      callback({
        transaction: {
          count: transactionCountMock,
          findMany: transactionFindManyMock,
          create: transactionCreateMock,
        },
        product: { findMany: productCostFindManyMock },
        inventoryLog: { createMany: inventoryLogCreateManyMock },
        customer: { update: customerUpdateMock },
      }),
    );
    applyProductStockDeltasMock.mockImplementation(
      async (_tx: unknown, input: { items: Array<{ productId: string; delta: number }> }) =>
        input.items.map((item) => ({
          productId: item.productId,
          stockGroupId: null,
          baseDelta: item.delta,
        })),
    );
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

  it("allocates distinct invoice numbers for a historical offline backlog", async () => {
    const invoices: Array<{ invoiceNumber: string; createdAt: Date }> = [];
    transactionCountMock.mockImplementation(async ({ where }) => invoices.filter((row) =>
      where.createdAt ? row.createdAt >= where.createdAt.gte : row.invoiceNumber.startsWith(where.invoiceNumber.startsWith),
    ).length);
    transactionFindManyMock.mockImplementation(async ({ where }) => invoices.filter((row) => row.invoiceNumber.startsWith(where.invoiceNumber.startsWith)));
    transactionCreateMock.mockImplementation(async ({ data }) => {
      if (invoices.some((row) => row.invoiceNumber === data.invoiceNumber)) {
        throw { code: "P2002", meta: { target: ["invoiceNumber"] } };
      }
      invoices.push(data);
      return { id: `tx-${invoices.length}` };
    });

    const response = await POST(request([offlineTx(), offlineTx({ clientMutationId: "offline-2" })]));
    const body = await response.json();
    expect(body.results.map((row: { status: string }) => row.status)).toEqual(["PENDING_APPROVAL", "PENDING_APPROVAL"]);
    expect(new Set(invoices.map((row) => row.invoiceNumber)).size).toBe(2);
  });

  it("uses the highest invoice sequence across stores even when numbering has gaps", async () => {
    const prefix = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-`;
    transactionFindManyMock.mockResolvedValue([{ invoiceNumber: `${prefix}0001` }, { invoiceNumber: `${prefix}0003` }]);
    await POST(request([offlineTx()]));
    expect(transactionCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ invoiceNumber: `${prefix}0004` }) }));
    expect(transactionFindManyMock).toHaveBeenCalledWith({ where: { invoiceNumber: { startsWith: prefix } }, select: { invoiceNumber: true } });
  });

  it("retries an invoice-number collision without treating it as a duplicate offline mutation", async () => {
    transactionCreateMock.mockRejectedValueOnce({ code: "P2002", meta: { target: ["invoiceNumber"] } });
    const response = await POST(request([offlineTx()]));
    const body = await response.json();
    expect(body.results[0].status).toBe("PENDING_APPROVAL");
    expect(transactionCreateMock).toHaveBeenCalledTimes(2);
    const numbers = transactionCreateMock.mock.calls.map(([args]) => args.data.invoiceNumber);
    expect(numbers[0]).not.toBe(numbers[1]);
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

  it("preserves the offline invoice timestamp and records its time source", async () => {
    const createdAt = "2026-10-05T02:15:00.000Z";

    const response = await POST(
      request([
        offlineTx({
          createdAt,
          timeSource: "SERVER_ESTIMATE",
        }),
      ]),
    );

    expect(response.status).toBe(200);
    const createArgs = transactionCreateMock.mock.calls[0][0];
    expect(createArgs.data.createdAt).toEqual(new Date(createdAt));
    expect(createArgs.data.invoiceDate).toEqual(new Date(createdAt));
    expect(createArgs.data.offlineSyncMetadata).toEqual(
      expect.objectContaining({ timeSource: "SERVER_ESTIMATE" }),
    );
  });

  it("writes transaction-linked stock snapshots when an offline sale is finalized", async () => {
    applyProductStockDeltasMock.mockResolvedValue([
      { productId: "product-1", stockGroupId: "group-1", baseDelta: -6 },
    ]);

    const response = await POST(
      request([
        offlineTx({
          createdAt: new Date().toISOString(),
          originalTotal: 2000,
        }),
      ]),
    );

    expect(response.status).toBe(200);
    const logArgs = inventoryLogCreateManyMock.mock.calls[0][0];
    expect(logArgs.data[0]).toEqual(
      expect.objectContaining({
        transactionId: "tx-1",
        sourceTransactionRef: "tx-1",
        stockGroupIdSnapshot: "group-1",
        unitMultiplierSnapshot: 3,
        stockBaseDelta: -6,
      }),
    );
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

  it("keeps Harga Khusus primary for legacy queued MEMBER preference", async () => {
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
        unitPrice: 90000,
        pricingRuleId: "rule-atk",
        appliedUnitPrice: 90000,
      }),
    );
  });
  it.each([[700, 4700], [800, 4800]])("uses current base modal %i for Rim price %i and preserves accounting cost", async (baseCost, rimPrice) => {
    const rim = { id: "product-1", storeId: "store-main", name: "Kertas A4", price: 50000, costPrice: 9000, unit: "rim", stock: 10, stockGroupId: "paper", categoryId: "cat-paper", category: { name: "Kertas" }, brandId: null, brand: null };
    productFindManyMock.mockImplementation(async (args: any) => args.where.OR ? [{ ...rim, stockGroup: { baseUnit: "pcs", storeId: "store-main" } }, { ...rim, id: "base-pcs", unit: "pcs", costPrice: baseCost, stockGroup: { baseUnit: "pcs", storeId: "store-main" } }] : [rim]);
    pricingRuleFindManyMock.mockResolvedValue([{ id: "formula-paper", categoryId: "cat-paper", category: { name: "Kertas" }, customerType: "PEMERINTAH", customerTypes: ["UMUM", "AGEN"], unit: "rim", brandId: null, brand: null, mode: "COST_PLUS_FLAT", value: 4000, isActive: true }]);
    productCostFindManyMock.mockResolvedValue([{ id: "product-1", costPrice: 9000 }]);
    const response = await POST(request([offlineTx({ createdAt: new Date().toISOString(), items: [{ productId: "product-1", name: "Kertas A4", price: rimPrice, quantity: 2 }], amountPaid: rimPrice * 2, originalSubtotal: rimPrice * 2, originalTotal: rimPrice * 2 })]));
    expect(response.status).toBe(200);
    expect(transactionCreateMock.mock.calls[0][0].data.items.create[0]).toMatchObject({ unitPrice: rimPrice, subtotal: rimPrice * 2, pricingRuleId: "formula-paper" });
    expect(inventoryLogCreateManyMock.mock.calls[0][0].data[0].unitCost).toBe(9000);
  });

});
