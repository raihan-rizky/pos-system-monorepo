import { beforeEach, describe, expect, it, vi } from "vitest";
const roundingSettingsMock = vi.hoisted(() => vi.fn());
const specialPricingSettingsMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/product-price-rounding/server/rounding-settings", () => ({ getPriceRoundingSettings: roundingSettingsMock }));
import { POST } from "../route";

const afterMock = vi.hoisted(() => vi.fn());
const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const applyProductStockDeltasMock = vi.hoisted(() => vi.fn());
const buildInventoryLogRowsMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const customerFindFirstMock = vi.hoisted(() => vi.fn());
const salespersonFindFirstMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const printingServiceFindManyMock = vi.hoisted(() => vi.fn());
const pricingRuleFindManyMock = vi.hoisted(() => vi.fn());
const transactionCountMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionCreateMock = vi.hoisted(() => vi.fn());
const transactionInventoryLogCreateManyMock = vi.hoisted(() => vi.fn());
const customerUpdateMock = vi.hoisted(() => vi.fn());
const invoiceNowMock = vi.hoisted(() => vi.fn());
const shiftFindFirstMock = vi.hoisted(() => vi.fn());
const shiftUpdateManyMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/invoice-date/services/internet-clock", () => ({ getInvoiceNow: invoiceNowMock }));

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

vi.mock("@/features/pos-checkout/post-commit", async () => ({
  ...await vi.importActual<typeof import("@/features/pos-checkout/post-commit")>("@/features/pos-checkout/post-commit"),
  buildInventoryLogRows: buildInventoryLogRowsMock,
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
    storeSettings: { findUnique: specialPricingSettingsMock },
    customer: { findFirst: customerFindFirstMock },
    salesperson: { findFirst: salespersonFindFirstMock },
    product: {
      findMany: productFindManyMock,
    },
    printingService: { findMany: printingServiceFindManyMock },
    categoryCustomerPricingRule: { findMany: pricingRuleFindManyMock },
    cashierShift: { findFirst: shiftFindFirstMock },
    transaction: {
      count: transactionCountMock,
      findMany: transactionFindManyMock,
      findFirst: transactionFindFirstMock,
      create: transactionCreateMock,
    },
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

describe("POST /api/transactions negative stock", () => {
  it("holds mixed offline replay for approval if its customer manual price is no longer allowed", async () => {
    specialPricingSettingsMock.mockResolvedValue({ specialPricingEnabled: false });
    customerFindFirstMock.mockResolvedValue({ id: "c1", type: "INDUSTRI" });
    const product = (await productFindManyMock())[0];
    productFindManyMock.mockResolvedValue([{ ...product, price: 5000, categoryId: "cat1" }]);
    printingServiceFindManyMock.mockResolvedValue([{ id: "service-1", name: "Cetak", basePrice: 1000, unit: "lembar" }]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      clientMutationId: "mixed-disabled-manual", originCashierId: "u1", originStoreId: "store-1",
      offlineReplay: { capturedAt: "2026-01-01T00:30:00.000Z" }, customerId: "c1", paymentMethod: "CASH", amountPaid: 5050,
      items: [
        { lineType: "PRODUCT", productId: "p1", quantity: 1, price: 4050, customerManualPrice: 4050 },
        { lineType: "PRINTING_SERVICE", printingServiceId: "service-1", name: "Cetak", quantity: 1, price: 1000 },
      ],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({
      status: "PENDING_APPROVAL", items: { create: [expect.objectContaining({ unitPrice: 5000, pricingRuleId: null }), expect.anything()] },
      offlineOriginalPayload: { items: expect.arrayContaining([expect.objectContaining({ customerManualPrice: 4050 })]) },
    });
  });
  it("preserves a raw customer manual price in mixed offline replay after the exception changes", async () => {
    roundingSettingsMock.mockResolvedValue({ enabled: true, increment: 500, threshold: 50, excludedCategoryIds: ["cat1"] });
    customerFindFirstMock.mockResolvedValue({ id: "c1", type: "INDUSTRI" });
    const product = (await productFindManyMock())[0];
    productFindManyMock.mockResolvedValue([{ ...product, price: 5000, categoryId: "cat1" }]);
    printingServiceFindManyMock.mockResolvedValue([{ id: "service-1", name: "Cetak", basePrice: 1000, unit: "lembar" }]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      clientMutationId: "mixed-manual-replay", originCashierId: "u1", originStoreId: "store-1",
      offlineReplay: { capturedAt: "2026-01-01T00:30:00.000Z" }, customerId: "c1", paymentMethod: "CASH", amountPaid: 5500,
      priceRoundingSettings: { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: [] },
      items: [
        { lineType: "PRODUCT", productId: "p1", quantity: 1, price: 4500, customerManualPrice: 4050, categoryId: "cat1" },
        { lineType: "PRINTING_SERVICE", printingServiceId: "service-1", name: "Cetak", quantity: 1, price: 1000 },
      ],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({
      status: "PENDING_APPROVAL", items: { create: [expect.objectContaining({ unitPrice: 4050, pricingRuleId: "customer-manual-price" }), expect.anything()] },
    });
  });
  it.each(["UMUM", "INDUSTRI", "PEMERINTAH"])("rejects a stale product category at checkout for %s", async customerType => {
    const settings = { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: ["cat1"] };
    roundingSettingsMock.mockResolvedValue(settings);
    customerFindFirstMock.mockResolvedValue({ id: "c1", type: customerType });
    const product = (await productFindManyMock())[0];
    productFindManyMock.mockResolvedValue([{ ...product, price: 4050, categoryId: "cat1" }]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      customerId: "c1", paymentMethod: "CASH", amountPaid: 10000, priceRoundingSettings: settings,
      items: [{ productId: "p1", quantity: 1, price: 4500, categoryId: "cat2" }],
    }) }));
    expect(response.status).toBe(409);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it("holds a mixed offline replay for approval when its rounding exceptions change", async () => {
    roundingSettingsMock.mockResolvedValue({ enabled: true, increment: 500, threshold: 50, excludedCategoryIds: ["cat1"] });
    customerFindFirstMock.mockResolvedValue({ id: "c1", type: "INDUSTRI" });
    const product = (await productFindManyMock())[0];
    productFindManyMock.mockResolvedValue([{ ...product, price: 4050, categoryId: "cat1" }]);
    printingServiceFindManyMock.mockResolvedValue([{ id: "service-1", name: "Cetak", basePrice: 1000, unit: "lembar" }]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      clientMutationId: "mixed-exception-replay", originCashierId: "u1", originStoreId: "store-1",
      offlineReplay: { capturedAt: "2026-01-01T00:30:00.000Z" }, customerId: "c1",
      paymentMethod: "CASH", amountPaid: 5500,
      priceRoundingSettings: { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: [] },
      items: [
        { lineType: "PRODUCT", productId: "p1", quantity: 1, price: 4500, categoryId: "cat1" },
        { lineType: "PRINTING_SERVICE", printingServiceId: "service-1", name: "Cetak", quantity: 1, price: 1000 },
      ],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({
      status: "PENDING_APPROVAL", items: { create: [expect.objectContaining({ unitPrice: 4050 }), expect.anything()] },
      offlineOriginalPayload: { items: expect.arrayContaining([expect.objectContaining({ productId: "p1", price: 4500 })]) },
    });
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
  });

  it("holds a mixed offline replay for approval when the product category changed", async () => {
    const settings = { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: ["cat1"] };
    roundingSettingsMock.mockResolvedValue(settings);
    customerFindFirstMock.mockResolvedValue({ id: "c1", type: "INDUSTRI" });
    const product = (await productFindManyMock())[0];
    productFindManyMock.mockResolvedValue([{ ...product, price: 4050, categoryId: "cat1" }]);
    printingServiceFindManyMock.mockResolvedValue([{ id: "service-1", name: "Cetak", basePrice: 1000, unit: "lembar" }]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      clientMutationId: "mixed-category-replay", originCashierId: "u1", originStoreId: "store-1",
      offlineReplay: { capturedAt: "2026-01-01T00:30:00.000Z" }, customerId: "c1",
      paymentMethod: "CASH", amountPaid: 5500, priceRoundingSettings: settings,
      items: [
        { lineType: "PRODUCT", productId: "p1", quantity: 1, price: 4500, categoryId: "cat2" },
        { lineType: "PRINTING_SERVICE", printingServiceId: "service-1", name: "Cetak", quantity: 1, price: 1000 },
      ],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({
      status: "PENDING_APPROVAL", items: { create: [expect.objectContaining({ unitPrice: 4050 }), expect.anything()] },
    });
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
  });
  it.each([undefined, 4050])("does not round excluded category transaction price %s", async custom => {
    const settings = { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: ["cat1"] };
    roundingSettingsMock.mockResolvedValue(settings);
    const product = (await productFindManyMock())[0];
    productFindManyMock.mockResolvedValue([{ ...product, categoryId: "cat1", price: 4049 }]);
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 10000, priceRoundingSettings: settings,
      items: [{ productId: "p1", quantity: 1, transactionPrice: custom }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data.items.create[0].unitPrice).toBe(custom ?? 4049);
  });

  it.each([
    { client: ["cat1"], server: ["cat1", "cat2"], status: 409 },
    { client: ["cat2", "cat1"], server: ["cat1", "cat2"], status: 201 },
    { client: undefined, server: ["cat1"], status: 409 },
  ])("compares category exceptions as policy sets: $client / $server", async ({ client, server, status }) => {
    roundingSettingsMock.mockResolvedValue({ enabled: true, increment: 500, threshold: 50, excludedCategoryIds: server });
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 10000,
      priceRoundingSettings: { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: client },
      items: [{ productId: "p1", quantity: 1 }],
    }) }));
    expect(response.status).toBe(status);
    if (status === 409) expect(transactionCreateMock).not.toHaveBeenCalled();
  });
  it("denies a custom invoice price without permission to edit prices", async () => {
    const { canRolePerformAction } = await import("@/features/rbac/helpers/rbac-core");
    vi.mocked(canRolePerformAction).mockImplementation((_role, resource) => resource !== "transaction.custom_price");
    try {
      const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
        paymentMethod: "CASH", amountPaid: 1000, items: [{ productId: "p1", quantity: 1, price: 800, transactionPrice: 800 }],
      }) }));
      expect(response.status).toBe(403);
      expect(transactionCreateMock).not.toHaveBeenCalled();
    } finally { vi.mocked(canRolePerformAction).mockReturnValue(true); }
  });
  it("allows custom invoice prices without master product update permission", async () => {
    const { canRolePerformAction } = await import("@/features/rbac/helpers/rbac-core");
    vi.mocked(canRolePerformAction).mockImplementation((_role, resource) => resource !== "product");
    try {
      const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
        paymentMethod: "CASH", amountPaid: 1000, items: [{ productId: "p1", quantity: 1, price: 800, transactionPrice: 800 }],
      }) }));
      expect(response.status).toBe(201);
    } finally { vi.mocked(canRolePerformAction).mockReturnValue(true); }
  });
  it.each([false, true])("saves a per-invoice custom price for a general customer with Harga Khusus %s", async enabled => {
    specialPricingSettingsMock.mockResolvedValue({ specialPricingEnabled: enabled });
    requireRoleMock.mockResolvedValue({ id: "u1", role: "OWNER", storeId: "store-1", name: "Owner" });
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 2000,
      items: [{ productId: "p1", quantity: 2, price: 800, transactionPrice: 800 }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ subtotal: 1600, total: 1600,
      items: { create: [expect.objectContaining({ unitPrice: 800, pricingRuleId: "transaction-custom-price", originalUnitPrice: 1000, appliedUnitPrice: 800 })] },
    });
    transactionCreateMock.mockClear();
    await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 2000, items: [{ productId: "p1", quantity: 1 }],
    }) }));
    expect(transactionCreateMock.mock.calls[0][0].data.items.create[0]).toMatchObject({ unitPrice: 1000, pricingRuleId: null });
  });

  it("keeps the custom marker when the explicit price equals the automatic price", async () => {
    requireRoleMock.mockResolvedValue({ id: "u1", role: "OWNER", storeId: "store-1", name: "Owner" });
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 1000, items: [{ productId: "p1", quantity: 1, price: 1000, transactionPrice: 1000 }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data.items.create[0]).toMatchObject({ unitPrice: 1000, pricingRuleId: "transaction-custom-price" });
  });

  it.each([0, -1])("rejects an invalid explicit invoice price %s", async transactionPrice => {
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 1000, items: [{ productId: "p1", quantity: 1, transactionPrice }],
    }) }));
    expect(response.status).toBe(422);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it("holds a mixed offline sale for approval when a product price changes", async () => {
    printingServiceFindManyMock.mockResolvedValue([{ id: "service-1", name: "Cetak", basePrice: 1000, unit: "lembar" }]);
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      clientMutationId: "mixed-replay", originCashierId: "u1", originStoreId: "store-1",
      offlineReplay: { capturedAt: "2026-01-01T00:30:00.000Z" },
      paymentMethod: "CASH", amountPaid: 1500, items: [
        { lineType: "PRODUCT", productId: "p1", name: "Item 1", quantity: 1, price: 500 },
        { lineType: "PRINTING_SERVICE", printingServiceId: "service-1", name: "Cetak", quantity: 1, price: 1000 },
      ],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({
      status: "PENDING_APPROVAL", amountPaid: 1500,
      offlineOriginalPayload: { items: expect.arrayContaining([expect.objectContaining({ productId: "p1", price: 500 })]) },
    });
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
  });
  it("preserves a replayed sale's capture time for its matching open shift", async () => {
    shiftFindFirstMock.mockResolvedValue({ id: "shift-1", openedAt: new Date("2026-01-01T00:00:00Z") });
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      clientMutationId: "replayed-sale", originCashierId: "u1", originStoreId: "store-1",
      offlineReplay: { shiftId: "shift-1", capturedAt: "2026-01-01T00:30:00.000Z" },
      paymentMethod: "CASH", amountPaid: 1000, items: [{ productId: "p1", quantity: 1 }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data.createdAt).toEqual(new Date("2026-01-01T00:30:00Z"));
    expect(shiftFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      id: "shift-1", cashierId: "u1", storeId: "store-1", status: "OPEN",
    }) }));
    expect(shiftUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "shift-1", status: "OPEN", cashierId: "u1", storeId: "store-1" }),
      data: { pausedDurationSeconds: { increment: 0 } },
    }));
    expect(shiftUpdateManyMock.mock.invocationCallOrder[0]).toBeLessThan(transactionCreateMock.mock.invocationCallOrder[0]);
  });

  it("rejects a replay if its originating shift is unavailable", async () => {
    shiftFindFirstMock.mockResolvedValue(null);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      clientMutationId: "replayed-sale", originCashierId: "u1", originStoreId: "store-1",
      offlineReplay: { shiftId: "shift-1", capturedAt: "2026-01-01T00:30:00.000Z" },
      paymentMethod: "CASH", amountPaid: 1000, items: [{ productId: "p1", quantity: 1 }],
    }) }));
    expect(response.status).toBe(409);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it("does not insert an unassigned replay into a shift already closed", async () => {
    shiftFindFirstMock.mockResolvedValue({ id: "closed-shift", status: "CLOSED" });
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      clientMutationId: "old-replay", originCashierId: "u1", originStoreId: "store-1",
      offlineReplay: { capturedAt: "2026-01-01T00:30:00.000Z" },
      paymentMethod: "CASH", amountPaid: 1000, items: [{ productId: "p1", quantity: 1 }],
    }) }));
    expect(response.status).toBe(409);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });
  it("rejects a queued checkout when the signed-in cashier changed", async () => {
    const response = await POST(new Request("http://localhost/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        clientMutationId: "checkout-original-cashier", originCashierId: "different-cashier", originStoreId: "store-1",
        paymentMethod: "CASH", amountPaid: 1000,
        items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1 }],
      }),
    }));
    expect(response.status).toBe(403);
    expect(dbTransactionMock).not.toHaveBeenCalled();
    expect(transactionFindFirstMock).not.toHaveBeenCalled();
  });
  it("returns the original transaction when a checkout is retried with its mutation ID", async () => {
    transactionFindFirstMock.mockResolvedValueOnce({ id: "existing-sale", status: "COMPLETED" });

    const response = await POST(new Request("http://localhost/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        clientMutationId: "checkout-unique-1",
        paymentMethod: "CASH",
        amountPaid: 1000,
        items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1 }],
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "existing-sale" });
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("stores the checkout mutation ID on a newly committed sale", async () => {
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        clientMutationId: "checkout-unique-2",
        paymentMethod: "CASH",
        amountPaid: 1000,
        items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1 }],
      }),
    }));

    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({
      offlineClientMutationId: "checkout-unique-2",
    });
  });

  it("returns the committed sale when two requests race with the same mutation ID", async () => {
    transactionFindFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "winning-sale", status: "COMPLETED" });
    dbTransactionMock.mockRejectedValueOnce({ code: "P2002", meta: { target: ["offlineClientMutationId"] } });
    const response = await POST(new Request("http://localhost/api/transactions", {
      method: "POST",
      body: JSON.stringify({
        clientMutationId: "checkout-race-1",
        paymentMethod: "CASH",
        amountPaid: 1000,
        items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1 }],
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "winning-sale" });
  });
  it.each(["AGEN", "PEMERINTAH"])("uses the product member price for %s when Harga Khusus is disabled", async (customerType) => {
    specialPricingSettingsMock.mockResolvedValue({ specialPricingEnabled: false });
    customerFindFirstMock.mockResolvedValue({ id: "customer-1", type: customerType });
    const product = (await productFindManyMock())[0];
    productFindManyMock.mockResolvedValue([{ ...product, hargaAgen: 700, hargaDinas: 600 }]);
    pricingRuleFindManyMock.mockResolvedValue([{ id: "rule-1", categoryId: "cat1", category: { name: "CAT1" }, customerType: "ALL", mode: "FLAT_DISCOUNT", value: 100, isActive: true }]);
    requireRoleMock.mockResolvedValue({ id: "u1", role: "OWNER", storeId: "store-1", name: "Owner" });
    applyProductStockDeltasMock.mockResolvedValue([]);

    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      customerId: "customer-1", paymentMethod: "CASH", amountPaid: 1000,
      items: [{ productId: "p1", quantity: 1, price: 400 }],
    }) }));

    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data.items.create[0]).toMatchObject({ unitPrice: customerType === "AGEN" ? 700 : 600 });
  });

  it.each([0.001, 999.999, 1000.01, true, {}, []])("rejects malformed or over-precise item discount %j without changing stock", async discount => {
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 10000, items: [{ productId: "p1", quantity: 1, discount }],
    }) }));
    expect(response.status).toBe(422);
    expect(transactionCreateMock).not.toHaveBeenCalled();
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
  });

  it.each([
    { discount: 0.01, subtotal: 999.99 },
    { discount: 999.99, subtotal: 0.01 },
  ])("persists a valid cent boundary discount $discount", async ({ discount, subtotal }) => {
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 1000, items: [{ productId: "p1", quantity: 1, discount }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ subtotal, total: subtotal,
      items: { create: [expect.objectContaining({ unitPrice: 1000, discount, subtotal })] },
    });
  });

  it("accepts a matching policy snapshot and stores the effective automatic selling price", async () => {
    const settings = { enabled: true, increment: 500, threshold: 50 };
    roundingSettingsMock.mockResolvedValue(settings);
    const product = (await productFindManyMock())[0];
    productFindManyMock.mockResolvedValue([{ ...product, price: 4049 }]);
    customerFindFirstMock.mockResolvedValue({ id: "customer-rounding", type: "INDUSTRI" });
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      customerId: "customer-rounding", paymentMethod: "CASH", amountPaid: 10000, priceRoundingSettings: settings,
      items: [{ productId: "p1", price: 4000, quantity: 1 }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ subtotal: 4000, total: 4000,
      items: { create: [expect.objectContaining({ unitPrice: 4000, appliedUnitPrice: 4000, originalUnitPrice: 4049 })] },
    });
  });

  it.each(["INDUSTRI", "PEMERINTAH"])("rejects an old rounded automatic price after policy changed for %s", async customerType => {
    roundingSettingsMock.mockResolvedValue({ enabled: false, increment: 500, threshold: 50 });
    const product = (await productFindManyMock())[0];
    productFindManyMock.mockResolvedValue([{ ...product, price: 4049 }]);
    customerFindFirstMock.mockResolvedValue({ id: "customer-rounding", type: customerType });
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      customerId: "customer-rounding", paymentMethod: "CASH", amountPaid: 10000,
      priceRoundingSettings: { enabled: true, increment: 500, threshold: 50 },
      items: [{ productId: "p1", price: 4000, quantity: 1 }],
    }) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ message: "Pengaturan pembulatan harga sudah berubah. Muat ulang harga sebelum melanjutkan transaksi." });
    expect(transactionCreateMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).not.toHaveBeenCalled();
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
  });

  it.each([{ enabled: true, increment: 1000, threshold: 50 }, { enabled: true, increment: 500, threshold: 100 }])("rejects a stale policy snapshot when its values change %j", async currentSettings => {
    roundingSettingsMock.mockResolvedValue(currentSettings);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 10000,
      priceRoundingSettings: { enabled: true, increment: 500, threshold: 50 },
      items: [{ productId: "p1", quantity: 1 }],
    }) }));
    expect(response.status).toBe(409);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it.each([
    { enabled: true, increment: 500, threshold: 501 },
    { enabled: true, increment: 0, threshold: 0 },
    { enabled: "true", increment: 500, threshold: 50 },
    { enabled: true, increment: 500.5, threshold: 50 },
  ])("validates the optional policy snapshot %j", async priceRoundingSettings => {
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 10000, priceRoundingSettings, items: [{ productId: "p1", quantity: 1 }],
    }) }));
    expect(response.status).toBe(422);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it.each([
    { enabled: true, custom: undefined, expected: 4000 },
    { enabled: true, custom: 4050, expected: 4500 },
    { enabled: false, custom: 4050, expected: 4050 },
  ])("stores final rounded prices with policy $enabled and custom $custom", async ({ enabled, custom, expected }) => {
    roundingSettingsMock.mockResolvedValue({ enabled, increment: 500, threshold: 50 });
    const original = (await productFindManyMock())[0];
    productFindManyMock.mockResolvedValue([{ ...original, price: 4049 }]);
    requireRoleMock.mockResolvedValue({ id: "u1", role: "OWNER", storeId: "store-1", name: "Owner" });
    applyProductStockDeltasMock.mockResolvedValue([]);
    customerFindFirstMock.mockResolvedValue({ id: "c-round", type: "INDUSTRI" });
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      customerId: "c-round", paymentMethod: "CASH", amountPaid: 20000,
      items: [{ productId: "p1", name: "Kertas", price: custom ?? 4049, transactionPrice: custom, quantity: 2, discount: 100 }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ subtotal: expected * 2 - 100, total: expected * 2 - 100,
      items: { create: [expect.objectContaining({ unitPrice: expected, appliedUnitPrice: expected, subtotal: expected * 2 - 100, discount: 100 })] },
    });
  });

  it("validates the discount against the server price instead of a forged client price", async () => {
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 20000,
      items: [{ productId: "p1", quantity: 1, price: 999999, discount: 1001 }],
    }) }));
    expect(response.status).toBe(422);
    expect(transactionCreateMock).not.toHaveBeenCalled();
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
  });

  it("still deducts sold quantities when a full item discount makes payment zero", async () => {
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 0,
      items: [{ productId: "p1", quantity: 3, discount: 3000 }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ status: "COMPLETED", total: 0 });
    expect(applyProductStockDeltasMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      items: [expect.objectContaining({ productId: "p1", delta: -3 })],
    }));
  });

  it("keeps discounts independent for multiple lines of the same product", async () => {
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 3000, discount: 100, taxRate: 10,
      items: [{ productId: "p1", quantity: 1, discount: 100 }, { productId: "p1", quantity: 2, discount: 500 }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ subtotal: 2400, discount: 100, tax: 230, total: 2530,
      items: { create: [expect.objectContaining({ quantity: 1, discount: 100, subtotal: 900 }), expect.objectContaining({ quantity: 2, discount: 500, subtotal: 1500 })] },
    });
  });

  it("completes a fully discounted sale with no payment or tax due", async () => {
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 0, taxRate: 10,
      items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1, discount: 1000 }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ subtotal: 0, tax: 0, total: 0, amountPaid: 0, status: "COMPLETED" });
  });

  it("deducts each line discount before invoice discount and tax, preserving gross unit prices", async () => {
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 3000, taxRate: 10, discount: 100,
      items: [{ lineType: "PRODUCT", productId: "p1", quantity: 3, discount: 500 }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({
      subtotal: 2500, discount: 100, tax: 240, total: 2640,
      items: { create: [expect.objectContaining({ unitPrice: 1000, quantity: 3, discount: 500, subtotal: 2500 })] },
    });
  });
  it.each([-1, 1001, "100", null])("rejects an invalid line discount %s before saving", async (discount) => {
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 2000,
      items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1, discount }],
    }) }));
    expect(response.status).toBe(422);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it.each([
    { rate: 12, discount: 100, tax: 108, total: 1008 },
    { rate: 12.5, discount: 0, tax: 125, total: 1125 },
    { rate: 0, discount: 0, tax: 0, total: 1000 },
    { rate: 100, discount: 0, tax: 1000, total: 2000 },
  ])("calculates and persists checkout tax $rate from server prices after discount", async ({ rate, discount, tax, total }) => {
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      taxRate: rate, tax: 999999, discount, amountPaid: total + 100, paymentMethod: "CASH",
      items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1, price: 1 }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ subtotal: 1000, taxRate: rate, taxMethod: "STANDARD", tax, total, change: 100 });
  });

  it.each([-1, 100.01, 1.001, "12"])("rejects invalid checkout tax %s before writing", async taxRate => {
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({ taxRate, amountPaid: 5000, items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1 }] }) }));
    expect(response.status).toBe(422);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it("requires full payment including the checkout tax", async () => {
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({ taxRate: 12, amountPaid: 1000, items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1 }] }) }));
    expect(response.status).toBe(422);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it.each(["DP", "TEMPO"])("includes checkout tax in customer debt for %s", async mode => {
    customerFindFirstMock.mockResolvedValue({ id: "c1", type: "UMUM" });
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({ taxRate: 12, customerId: "c1", amountPaid: 500, payments: [{ method: "CASH", amount: 500 }], paymentMethod: mode === "TEMPO" ? "TEMPO" : "CASH", paymentStatus: mode === "DP" ? "DP" : "COMPLETED", items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1 }] }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ tax: 120, total: 1120, change: 0 });
    expect(customerUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalDebt: { increment: 620 } }) }));
  });
  it("calculates sequential unit modal pricing on the server and snapshots both percentages", async () => {
    pricingRuleFindManyMock.mockResolvedValue([{ id: "sequential", categoryId: "cat1", category: { name: "Produk" }, customerType: null, customerTypes: [], unit: null, brandId: null, mode: "UNIT_COST_PLUS_PERCENT_DISCOUNT", value: 10, discountPercent: 5, isActive: true }]);
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({ paymentMethod: "CASH", amountPaid: 20000, paymentStatus: "COMPLETED", items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1 }] }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data.items.create[0]).toMatchObject({ unitPrice: 522.5, pricingValue: 10, pricingDiscountPercent: 5 });
  });
  it("persists the synchronized Internet date instead of a drifting device clock", async () => {
    invoiceNowMock.mockResolvedValue(new Date("2030-01-02T20:00:00Z"));
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 1000, paymentStatus: "COMPLETED", items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1 }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ invoiceDate: new Date("2030-01-02T20:00:00Z"), invoiceNumber: "INV-20300103-0001" });
  });
  it("commits customer totals with the sale before stock even when after is deferred", async () => {
    afterMock.mockImplementation(() => undefined);
    customerFindFirstMock.mockResolvedValue({ id: "c1", type: "UMUM" });
    applyProductStockDeltasMock.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({
      customerId: "c1", paymentMethod: "CASH", amountPaid: 1500, paymentStatus: "COMPLETED",
      items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1 }],
    }) }));
    expect(response.status).toBe(201);
    expect(customerUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalSpent: { increment: 1000 }, totalOrders: { increment: 1 } }) }));
    expect(customerUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(transactionCreateMock.mock.invocationCallOrder[0]);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    specialPricingSettingsMock.mockResolvedValue({ specialPricingEnabled: true });
    roundingSettingsMock.mockResolvedValue({ enabled: false, increment: 500, threshold: 50 });
    invoiceNowMock.mockImplementation(async () => new Date());
    afterMock.mockImplementation((cb: any) => cb());
    requireRoleMock.mockResolvedValue({
      id: "u1",
      role: "CASHIER",
      storeId: "store-1",
      name: "Cashier",
    });
    handleAuthErrorMock.mockReturnValue(null);
    customerFindFirstMock.mockResolvedValue(true);
    salespersonFindFirstMock.mockResolvedValue(true);
    productFindManyMock.mockResolvedValue([
      {
        id: "p1",
        name: "Item 1",
        price: "1000",
        costPrice: "500",
        hargaDinas: null,
        hargaAgen: null,
        stock: -5,
        unit: "pcs",
        categoryId: "cat1",
        brandId: null,
        brand: null,
        category: { name: "CAT1" },
      },
    ]);
    pricingRuleFindManyMock.mockResolvedValue([]);
    transactionCountMock.mockResolvedValue(0);
    transactionFindManyMock.mockResolvedValue([]);
    transactionFindFirstMock.mockReset().mockResolvedValue(null);
    shiftFindFirstMock.mockReset().mockResolvedValue(null);
    transactionCreateMock.mockResolvedValue({ id: "tx-1", status: "COMPLETED" });
    shiftUpdateManyMock.mockResolvedValue({ count: 1 });
    buildInventoryLogRowsMock.mockReturnValue([]);
    transactionInventoryLogCreateManyMock.mockResolvedValue({ count: 0 });
    dbTransactionMock.mockImplementation(async (cb: any) => cb({
      transaction: { create: transactionCreateMock },
      transactionItemSnapshot: { createMany: vi.fn() },
      inventoryLog: { createMany: transactionInventoryLogCreateManyMock },
      customer: { update: customerUpdateMock },
      cashierShift: { updateMany: shiftUpdateManyMock, findFirst: shiftFindFirstMock },
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

  it("writes the exact stock movement snapshot in the transaction that deducts stock", async () => {
    applyProductStockDeltasMock.mockResolvedValue([
      { productId: "p1", stockGroupId: "group-1", baseDelta: -8 },
    ]);
    buildInventoryLogRowsMock.mockReturnValue([
      {
        productId: "p1",
        type: "OUT",
        reason: "SALE",
        quantity: 2,
        unitCost: 500,
        note: "Penjualan INV-20261005-0001",
        createdBy: "u1",
        person: "Cashier",
      },
    ]);

    const response = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "CASH",
          amountPaid: 2000,
          discount: 0,
          paymentStatus: "COMPLETED",
          items: [{ lineType: "PRODUCT", productId: "p1", quantity: 2, price: 1000 }],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(transactionInventoryLogCreateManyMock).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          transactionId: "tx-1",
          sourceTransactionRef: "tx-1",
          stockGroupIdSnapshot: "group-1",
          unitMultiplierSnapshot: 4,
          stockBaseDelta: -8,
        }),
      ],
    });
  });

  it("creates an unpaid Tempo invoice without treating it as a DP or cash payment", async () => {
    applyProductStockDeltasMock.mockResolvedValue([]);
    customerFindFirstMock.mockResolvedValue({
      id: "customer-tempo",
      type: "UMUM",
    });

    const response = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "TEMPO",
          amountPaid: 0,
          discount: 0,
          customerName: "Pelanggan Tempo",
          customerId: "customer-tempo",
          paymentStatus: "COMPLETED",
          items: [
            {
              lineType: "PRODUCT",
              productId: "p1",
              quantity: 1,
              price: 1000,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(201);
    const createArg = transactionCreateMock.mock.calls[0][0];
    expect(createArg.data).toEqual(
      expect.objectContaining({
        paymentMethod: "TEMPO",
        amountPaid: 0,
        status: "COMPLETED",
        change: 0,
      }),
    );
    expect(createArg.data).not.toHaveProperty("payments");
    expect(customerUpdateMock).toHaveBeenCalledWith({
      where: { id: "customer-tempo" },
      data: expect.objectContaining({ totalDebt: { increment: 1000 }, totalOrders: { increment: 1 }, totalSpent: { increment: 0 } }),
    });
  });

  it("records only actual partial tenders for Tempo and atomically adds the balance to debt", async () => {
    applyProductStockDeltasMock.mockResolvedValue([]);
    customerFindFirstMock.mockResolvedValue({ id: "customer-tempo", type: "UMUM" });

    const response = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "TEMPO",
          amountPaid: 250,
          payments: [{ method: "CASH", amount: 250 }],
          discount: 0,
          customerName: "Pelanggan Tempo",
          customerId: "customer-tempo",
          paymentStatus: "COMPLETED",
          items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1 }],
        }),
      }),
    );

    expect(response.status).toBe(201);
    const createArg = transactionCreateMock.mock.calls[0][0];
    expect(createArg.data).toEqual(
      expect.objectContaining({ paymentMethod: "TEMPO", amountPaid: 250 }),
    );
    expect(createArg.data.payments.create).toEqual([
      { method: "CASH", amount: 250 },
    ]);
    expect(customerUpdateMock).toHaveBeenCalledWith({
      where: { id: "customer-tempo" },
      data: expect.objectContaining({ totalDebt: { increment: 750 }, totalOrders: { increment: 1 }, totalSpent: { increment: 250 } }),
    });
  });

  it("requires a registered customer and does not accept Tempo as a DP", async () => {
    const noCustomerResponse = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "TEMPO",
          amountPaid: 0,
          discount: 0,
          customerName: "Pelanggan Umum",
          customerId: null,
          paymentStatus: "COMPLETED",
          items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1 }],
        }),
      }),
    );

    expect(noCustomerResponse.status).toBe(422);
    expect(transactionCreateMock).not.toHaveBeenCalled();

    const tempoDpResponse = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "TEMPO",
          amountPaid: 0,
          discount: 0,
          customerName: "Pelanggan Tempo",
          customerId: "customer-tempo",
          paymentStatus: "DP",
          items: [{ lineType: "PRODUCT", productId: "p1", quantity: 1 }],
        }),
      }),
    );

    expect(tempoDpResponse.status).toBe(422);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it("applies ALL pricing rules scoped by selected product unit and brand", async () => {
    applyProductStockDeltasMock.mockResolvedValue([]);
    productFindManyMock.mockResolvedValue([
      {
        id: "p1",
        name: "Kertas A4",
        price: "1000",
        costPrice: "500",
        hargaDinas: null,
        hargaAgen: null,
        stock: 10,
        unit: "Rim",
        categoryId: "cat1",
        brandId: "brand-joyko",
        brand: { id: "brand-joyko", name: "Joyko" },
        category: { name: "Kertas" },
      },
    ]);
    pricingRuleFindManyMock.mockResolvedValue([
      {
        id: "rule-all-rim-joyko",
        categoryId: "cat1",
        customerType: null,
        unit: "rim",
        brandId: "brand-joyko",
        brand: { name: "Joyko" },
        mode: "PERCENT_DISCOUNT",
        value: "10",
        isActive: true,
        updatedAt: new Date("2026-07-03T00:00:00.000Z"),
        category: { name: "Kertas" },
      },
    ]);

    const res = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "CASH",
          amountPaid: 2000,
          discount: 0,
          customerName: "Umum",
          customerId: null,
          paymentStatus: "COMPLETED",
          items: [
            {
              lineType: "PRODUCT",
              productId: "p1",
              quantity: 1,
            },
          ],
        }),
      }),
    );

    expect(res.status).toBe(201);
    const createArg = transactionCreateMock.mock.calls[0][0];
    expect(createArg.data.items.create[0]).toEqual(
      expect.objectContaining({
        unitPrice: 900,
        pricingRuleId: "rule-all-rim-joyko",
        pricingCustomerType: "UMUM",
        pricingCategoryId: "cat1",
        pricingCategoryName: "Kertas",
        pricingUnit: "rim",
        pricingBrandId: "brand-joyko",
        pricingBrandName: "Joyko",
        originalUnitPrice: 1000,
        appliedUnitPrice: 900,
      }),
    );
  });

  async function createAgenPricingTransaction(
    pricingPreference?: "SPECIAL" | "MEMBER",
  ) {
    applyProductStockDeltasMock.mockResolvedValue([]);
    customerFindFirstMock.mockResolvedValue({
      id: "customer-agen",
      type: "AGEN",
    });
    productFindManyMock.mockResolvedValue([
      {
        id: "p1",
        name: "Pulpen",
        price: "100000",
        costPrice: "50000",
        hargaDinas: null,
        hargaAgen: "95000",
        stock: 10,
        unit: "pcs",
        categoryId: "cat-atk",
        brandId: null,
        brand: null,
        category: { name: "ATK" },
      },
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
        value: "10",
        isActive: true,
        updatedAt: new Date("2026-07-03T00:00:00.000Z"),
        category: { name: "ATK" },
      },
    ]);

    return POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "CASH",
          amountPaid: 100000,
          discount: 0,
          customerName: "Agen ATK",
          customerId: "customer-agen",
          paymentStatus: "COMPLETED",
          ...(pricingPreference ? { pricingPreference } : {}),
          items: [
            {
              lineType: "PRODUCT",
              productId: "p1",
              quantity: 1,
              price: 1,
            },
          ],
        }),
      }),
    );
  }

  it("recalculates with explicit Harga Agen as the default priority", async () => {
    const response = await createAgenPricingTransaction("SPECIAL");

    expect(response.status).toBe(201);
    const createArg = transactionCreateMock.mock.calls[0][0];
    expect(createArg.data.items.create[0]).toEqual(
      expect.objectContaining({
        unitPrice: 95000,
        pricingRuleId: "harga-agen",
      }),
    );
  });

  it("keeps explicit Harga Agen primary with a legacy MEMBER preference", async () => {
    const response = await createAgenPricingTransaction("MEMBER");

    expect(response.status).toBe(201);
    const createArg = transactionCreateMock.mock.calls[0][0];
    expect(createArg.data.items.create[0]).toEqual(
      expect.objectContaining({
        unitPrice: 95000,
        pricingRuleId: "harga-agen",
        appliedUnitPrice: 95000,
      }),
    );
  });

  it("applies explicit Harga Agen when new transaction requests omit the priority field", async () => {
    const response = await createAgenPricingTransaction();

    expect(response.status).toBe(201);
    const createArg = transactionCreateMock.mock.calls[0][0];
    expect(createArg.data.items.create[0]).toEqual(
      expect.objectContaining({
        unitPrice: 95000,
        pricingRuleId: "harga-agen",
        appliedUnitPrice: 95000,
      }),
    );
  });

  it("lets OWNER create an invoice with a custom invoice date and matching invoice number date", async () => {
    requireRoleMock.mockResolvedValue({
      id: "owner-1",
      role: "OWNER",
      storeId: "store-1",
      name: "Owner",
    });
    transactionCountMock.mockResolvedValue(4);
    applyProductStockDeltasMock.mockResolvedValue([]);

    const res = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "CASH",
          amountPaid: 1000,
          discount: 0,
          customerName: "Umum",
          customerId: null,
          paymentStatus: "COMPLETED",
          invoiceDate: "2026-07-01",
          invoiceTime: "14:05",
          invoiceDateReason: "Invoice susulan dari arsip manual",
          items: [
            {
              lineType: "PRODUCT",
              productId: "p1",
              quantity: 1,
            },
          ],
        }),
      }),
    );

    expect(res.status).toBe(201);
    const createArg = transactionCreateMock.mock.calls[0][0];
    expect(createArg.data.invoiceDate.toISOString()).toBe(
      "2026-07-01T07:05:00.000Z",
    );
    expect(createArg.data.invoiceNumber).toBe("INV-20260701-0005");
    expect(transactionCountMock).toHaveBeenCalledWith({
      where: {
        storeId: "store-1",
        invoiceNumber: { startsWith: "INV-20260701-" },
      },
    });
  });

  it("rejects a custom invoice date from CASHIER", async () => {
    const res = await POST(
      new Request("http://localhost/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "CASH",
          amountPaid: 1000,
          discount: 0,
          customerName: "Umum",
          customerId: null,
          paymentStatus: "COMPLETED",
          invoiceDate: "2026-07-01",
          items: [
            {
              lineType: "PRODUCT",
              productId: "p1",
              quantity: 1,
            },
          ],
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
  it.each([[700, 4700], [800, 4800]])("uses current base modal %i for Rim price %i and preserves accounting cost", async (baseCost, rimPrice) => {
    const rim = { id: "p1", storeId: "store-main", name: "Kertas A4", price: 50000, costPrice: 9000, unit: "rim", stock: 10, stockGroupId: "paper", categoryId: "cat-paper", category: { name: "Kertas" }, brandId: null, brand: null };
    productFindManyMock.mockImplementation(async (args: any) => args.where.OR ? [{ ...rim, stockGroup: { baseUnit: "pcs", storeId: "store-main" } }, { ...rim, id: "base-pcs", unit: "pcs", costPrice: baseCost, stockGroup: { baseUnit: "pcs", storeId: "store-main" } }] : [rim]);
    pricingRuleFindManyMock.mockResolvedValue([{ id: "formula-paper", categoryId: "cat-paper", category: { name: "Kertas" }, customerType: "PEMERINTAH", customerTypes: ["UMUM", "AGEN"], unit: "rim", brandId: null, brand: null, mode: "COST_PLUS_FLAT", value: 4000, isActive: true }]);
    const response = await POST(new Request("http://localhost/api/transactions", { method: "POST", body: JSON.stringify({ paymentMethod: "CASH", amountPaid: rimPrice * 2, paymentStatus: "COMPLETED", items: [{ lineType: "PRODUCT", productId: "p1", quantity: 2 }] }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data.items.create[0]).toMatchObject({ unitPrice: rimPrice, subtotal: rimPrice * 2, pricingRuleId: "formula-paper" });
    expect(transactionCreateMock.mock.calls[0][0].data.items.create[0].unitCost).toBe(9000);
  });

});
