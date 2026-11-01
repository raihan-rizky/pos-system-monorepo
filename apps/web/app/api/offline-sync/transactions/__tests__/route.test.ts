import { beforeEach, describe, expect, it, vi } from "vitest";
const roundingSettingsMock = vi.hoisted(() => vi.fn());
const specialPricingSettingsMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/product-price-rounding/server/rounding-settings", () => ({ getPriceRoundingSettings: roundingSettingsMock }));
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
const shiftUpdateManyMock = vi.hoisted(() => vi.fn());
const shiftFindFirstMock = vi.hoisted(() => vi.fn());
const canRolePerformActionMock = vi.hoisted(() => vi.fn().mockReturnValue(true));

vi.mock("@/features/rbac/helpers/rbac-server", () => ({
  getGlobalRolePermissions: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/rbac/helpers/rbac-core", async () => ({
  ...await vi.importActual<typeof import("@/features/rbac/helpers/rbac-core")>("@/features/rbac/helpers/rbac-core"),
  canRolePerformAction: canRolePerformActionMock,
}));

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  requireRole: requirePermissionMock,
  AuthError: class AuthError extends Error {},
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/product-stock-groups/stock-mutations", () => ({
  applyProductStockDeltas: applyProductStockDeltasMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    storeSettings: { findUnique: specialPricingSettingsMock },
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
    originCashierId: "cashier-1",
    originStoreId: "store-main",
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
  it("locks the originating shift before saving a replayed sale", async () => {
    const response = await POST(request([offlineTx({ shiftId: "shift-1", createdAt: new Date().toISOString() })]));
    expect((await response.json()).results[0].status).toBe("SYNCED");
    expect(shiftUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "shift-1", cashierId: "cashier-1", storeId: "store-main", status: "OPEN" }),
      data: { pausedDurationSeconds: { increment: 0 } },
    }));
    expect(shiftUpdateManyMock.mock.invocationCallOrder[0]).toBeLessThan(transactionCreateMock.mock.invocationCallOrder[0]);
  });

  it("keeps a sale for review if the originating shift was closed", async () => {
    shiftUpdateManyMock.mockResolvedValue({ count: 0 });
    const response = await POST(request([offlineTx({ shiftId: "shift-1", createdAt: new Date().toISOString() })]));
    expect((await response.json()).results[0]).toMatchObject({ status: "FAILED_FINAL", message: expect.stringMatching(/shift/i) });
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it("retains an older unassigned sale when its store shift has already closed", async () => {
    shiftFindFirstMock.mockResolvedValue({ id: "closed-shift", status: "CLOSED" });
    const response = await POST(request([offlineTx({ createdAt: new Date().toISOString() })]));
    expect((await response.json()).results[0]).toMatchObject({ status: "FAILED_FINAL", message: expect.stringMatching(/shift/i) });
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it("retains a sale whose device capture time is in the future", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const response = await POST(request([offlineTx({ createdAt: future })]));
    expect((await response.json()).results[0]).toMatchObject({ status: "FAILED_FINAL", message: expect.stringMatching(/waktu/i) });
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });
  it("uses shared base stock rather than a variant's stale stock field", async () => {
    productFindManyMock.mockResolvedValue([{
      id: "product-1", storeId: "store-main", name: "Kertas", price: 1000,
      stock: 0, stockGroupId: "group-1", unit: "rim", unitMultiplierToBase: 6,
      stockGroup: { id: "group-1", baseStock: 12, baseUnit: "lembar", storeId: "store-main" },
    }]);

    const response = await POST(request([offlineTx({ createdAt: new Date().toISOString() })]));

    expect((await response.json()).results[0].status).toBe("SYNCED");
    expect(applyProductStockDeltasMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      items: [{ productId: "product-1", delta: -2 }],
    }));
  });

  it("allocates shared base stock across variants before deciding approval", async () => {
    const stockGroup = { id: "group-1", baseStock: 12, baseUnit: "lembar", storeId: "store-main" };
    productFindManyMock.mockResolvedValue([
      { id: "product-1", storeId: "store-main", name: "Kertas rim", price: 1000, stock: 100,
        stockGroupId: "group-1", unit: "rim", unitMultiplierToBase: 6, stockGroup },
      { id: "product-2", storeId: "store-main", name: "Kertas lembar", price: 100, stock: 100,
        stockGroupId: "group-1", unit: "lembar", unitMultiplierToBase: 1, stockGroup },
    ]);

    const response = await POST(request([offlineTx({
      createdAt: new Date().toISOString(),
      items: [
        { productId: "product-1", name: "Kertas rim", price: 1000, quantity: 1 },
        { productId: "product-2", name: "Kertas lembar", price: 100, quantity: 8 },
      ],
      originalSubtotal: 1800, originalTotal: 1800, amountPaid: 1800,
    })]));

    expect((await response.json()).results[0].status).toBe("PENDING_APPROVAL");
    expect(transactionCreateMock.mock.calls[0][0].data.items.create).toEqual([
      expect.objectContaining({ productId: "product-1", quantity: 1 }),
      expect.objectContaining({ productId: "product-2", quantity: 6 }),
    ]);
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
  });

  it("preserves the authorized invoice date and time from an offline sale", async () => {
    requirePermissionMock.mockResolvedValue({ id: "cashier-1", role: "OWNER", storeId: "store-main", name: "Owner" });
    const response = await POST(request([offlineTx({
      createdAt: new Date().toISOString(), invoiceDate: "2026-10-28", invoiceTime: "09:30", invoiceDateReason: "Koreksi tanggal",
    })]));
    expect((await response.json()).results[0].status).toBe("SYNCED");
    expect(transactionCreateMock.mock.calls[0][0].data.invoiceDate).toEqual(new Date("2026-10-28T02:30:00.000Z"));
    expect(transactionCreateMock.mock.calls[0][0].data.invoiceNumber).toMatch(/^INV-20261028-/);
  });

  it("rejects a custom invoice date from a role that cannot set it", async () => {
    const response = await POST(request([offlineTx({ createdAt: new Date().toISOString(), invoiceDate: "2026-10-28" })]));
    expect((await response.json()).results[0].status).toBe("FAILED_FINAL");
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });
  it("requires a reason when an offline invoice uses a different day", async () => {
    requirePermissionMock.mockResolvedValue({ id: "cashier-1", role: "OWNER", storeId: "store-main" });
    const response = await POST(request([offlineTx({
      createdAt: "2026-11-01T02:00:00.000Z", invoiceDate: "2026-10-28",
    })]));
    expect((await response.json()).results[0].status).toBe("FAILED_FINAL");
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });
  it("preserves cash tender and change", async () => {
    await POST(request([offlineTx({ createdAt: new Date().toISOString(), amountPaid: 2500, payments: [{ method: "CASH", amount: 2500 }] })]));
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({
      status: "COMPLETED", amountPaid: 2500, change: 500,
      payments: { create: [{ method: "CASH", amount: 2500 }] },
    });
  });

  it("preserves each part of a split payment", async () => {
    await POST(request([offlineTx({ createdAt: new Date().toISOString(), payments: [{ method: "CASH", amount: 500 }, { method: "TRANSFER", amount: 1500 }] })]));
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({
      paymentMethod: "TRANSFER", amountPaid: 2000,
      payments: { create: [{ method: "CASH", amount: 500 }, { method: "TRANSFER", amount: 1500 }] },
    });
  });

  it("records a partial DP payment without marking it fully paid", async () => {
    customerFindFirstMock.mockResolvedValue({ id: "customer-1", type: "UMUM" });
    const response = await POST(request([offlineTx({ createdAt: new Date().toISOString(), customerId: "customer-1", paymentStatus: "DP", amountPaid: 500, payments: [{ method: "CASH", amount: 500 }] })]));
    expect((await response.json()).results[0].status).toBe("SYNCED");
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({
      status: "DP", amountPaid: 500, change: 0,
      payments: { create: [{ method: "CASH", amount: 500 }] },
    });
    expect(applyProductStockDeltasMock).toHaveBeenCalled();
    expect(customerUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalDebt: { increment: 1500 }, totalSpent: { increment: 500 } }) }));
  });

  it("records a Tempo sale and its actual initial payment", async () => {
    customerFindFirstMock.mockResolvedValue({ id: "customer-1", type: "UMUM" });
    const response = await POST(request([offlineTx({ createdAt: new Date().toISOString(), paymentMethod: "TEMPO", customerId: "customer-1", amountPaid: 500, payments: [{ method: "TRANSFER", amount: 500 }] })]));
    expect((await response.json()).results[0].status).toBe("SYNCED");
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({
      status: "COMPLETED", paymentMethod: "TEMPO", amountPaid: 500, change: 0,
      payments: { create: [{ method: "TRANSFER", amount: 500 }] },
    });
    expect(customerUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalDebt: { increment: 1500 }, totalSpent: { increment: 500 } }) }));
  });

  it("holds a sale when the payment breakdown does not match the amount collected", async () => {
    const response = await POST(request([offlineTx({ payments: [{ method: "CASH", amount: 100 }] })]));
    expect((await response.json()).results[0].status).toBe("FAILED_FINAL");
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it("uses the sales request permission when a salesperson syncs", async () => {
    requirePermissionMock.mockResolvedValue({ id: "cashier-1", role: "SALES", storeId: "store-main" });
    canRolePerformActionMock.mockImplementation((_role, resource) => resource === "transaction.request");
    const response = await POST(request([offlineTx({ createdAt: new Date().toISOString() })]));
    expect(response.status).toBe(200);
    expect(canRolePerformActionMock).toHaveBeenCalledWith("SALES", "transaction.request", "create", expect.anything());
    expect((await response.json()).results[0].status).toBe("PENDING_APPROVAL");
  });

  it("attributes an auto-approved salesperson's synced sale the same way as online checkout", async () => {
    requirePermissionMock.mockResolvedValue({ id: "cashier-1", role: "SALES", storeId: "store-main" });
    const response = await POST(request([offlineTx({ createdAt: new Date().toISOString() })]));
    expect((await response.json()).results[0].status).toBe("SYNCED");
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ cashierId: "cashier-1", requestedById: null });
  });

  it("rejects syncing when transaction creation permission is denied", async () => {
    canRolePerformActionMock.mockReturnValue(false);
    handleAuthErrorMock.mockReturnValue(new Response(null, { status: 403 }));
    const response = await POST(request([offlineTx()]));
    expect(response.status).toBe(403);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it("isolates an invalid queued sale from valid sales in the same batch", async () => {
    const response = await POST(request([
      offlineTx({ clientMutationId: "invalid", paymentMethod: "UNKNOWN" }),
      offlineTx({ clientMutationId: "valid", createdAt: new Date().toISOString() }),
    ]));

    expect(response.status).toBe(200);
    expect((await response.json()).results).toEqual([
      expect.objectContaining({ clientMutationId: "invalid", status: "FAILED_FINAL" }),
      expect.objectContaining({ clientMutationId: "valid", status: "SYNCED" }),
    ]);
    expect(transactionCreateMock).toHaveBeenCalledTimes(1);
  });

  it("marks unexpected server errors as retryable without deleting the sale", async () => {
    dbTransactionMock.mockRejectedValueOnce(new Error("database temporarily unavailable"));
    const response = await POST(request([offlineTx()]));
    expect((await response.json()).results[0]).toMatchObject({ status: "FAILED_RETRYABLE" });
  });

  it.each([
    { originCashierId: "cashier-2", originStoreId: "store-main" },
    { originCashierId: "cashier-1", originStoreId: "store-2" },
    { originCashierId: undefined, originStoreId: undefined },
  ])("retains a sale for review when its originating cashier or store cannot be verified: %o", async (origin) => {
    const response = await POST(request([offlineTx(origin)]));
    const result = (await response.json()).results[0];
    expect(result.status).toBe("FAILED_FINAL");
    expect(result.serverTransactionId).toBeUndefined();
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it.each([false, true])("does not expose or accept another cashier's transaction when a mutation ID collides (race: %s)", async (race) => {
    const otherSale = { id: "other-sale", status: "COMPLETED", storeId: "store-main", cashierId: "other-cashier", requestedById: null };
    if (race) {
      transactionFindUniqueMock.mockResolvedValueOnce(null).mockResolvedValueOnce(otherSale);
      dbTransactionMock.mockRejectedValueOnce({ code: "P2002" });
    } else {
      transactionFindUniqueMock.mockResolvedValueOnce(otherSale);
    }

    const response = await POST(request([offlineTx()]));
    const result = (await response.json()).results[0];

    expect(result.status).toBe("FAILED_FINAL");
    expect(result.serverTransactionId).toBeUndefined();
  });

  it("keeps an unchanged offline sale pending when the cashier cannot auto-approve", async () => {
    canRolePerformActionMock.mockImplementation((_role, resource) => resource !== "transaction.auto_approve");

    const response = await POST(request([offlineTx({ createdAt: new Date().toISOString() })]));
    const body = await response.json();

    expect(body.results[0]).toMatchObject({ status: "PENDING_APPROVAL" });
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({
      status: "PENDING_APPROVAL",
      amountPaid: 2000,
    });
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
  });

  it("requires approval when item prices change even if their total stays the same", async () => {
    productFindManyMock.mockResolvedValue([
      { id: "product-1", name: "Produk A", price: 1100, stock: 10 },
      { id: "product-2", name: "Produk B", price: 900, stock: 10 },
    ]);
    const items = [
      { productId: "product-1", name: "Produk A", price: 1000, quantity: 1 },
      { productId: "product-2", name: "Produk B", price: 1000, quantity: 1 },
    ];

    const response = await POST(request([offlineTx({ createdAt: new Date().toISOString(), items })]));

    expect((await response.json()).results[0].status).toBe("PENDING_APPROVAL");
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({
      status: "PENDING_APPROVAL",
      offlineSyncMetadata: { reason: "ITEM_PRICE_CHANGED" },
      offlineOriginalPayload: { items },
    });
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
  });

  it("reprices an offline manual special price and requests approval when Harga Khusus is disabled", async () => {
    specialPricingSettingsMock.mockResolvedValue({ specialPricingEnabled: false });
    const response = await POST(request([offlineTx({
      items: [{ productId: "product-1", name: "Product 1", price: 500, transactionPrice: 500, quantity: 1 }],
      amountPaid: 500, originalSubtotal: 500, originalTotal: 500,
    })]));

    expect((await response.json()).results[0]).toMatchObject({ status: "PENDING_APPROVAL" });
    expect(transactionCreateMock.mock.calls[0][0].data.items.create[0]).toMatchObject({ unitPrice: 1000 });
  });

  it("honors online pricing authorization when a salesperson submits a transaction price", async () => {
    requirePermissionMock.mockResolvedValue({ id: "cashier-1", role: "SALES", storeId: "store-main" });
    customerFindFirstMock.mockResolvedValue({ id: "customer-1", type: "INDUSTRI" });
    const response = await POST(request([offlineTx({
      createdAt: new Date().toISOString(), customerId: "customer-1",
      items: [{ productId: "product-1", name: "Product 1", price: 500, transactionPrice: 500, quantity: 1 }],
      amountPaid: 500, originalSubtotal: 500, originalTotal: 500,
    })]));

    expect((await response.json()).results[0]).toMatchObject({ status: "PENDING_APPROVAL" });
    expect(transactionCreateMock.mock.calls[0][0].data.items.create[0]).toMatchObject({ unitPrice: 1000 });
    expect(applyProductStockDeltasMock).not.toHaveBeenCalled();
  });

  it("keeps each repeated product price snapshot equal to its own final rounded custom price", async () => {
    setupAgenPricing();
    customerFindFirstMock.mockResolvedValue({ id: "agen-1", type: "INDUSTRI" });
    roundingSettingsMock.mockResolvedValue({ enabled: true, increment: 500, threshold: 50 });
    const response = await POST(request([offlineTx({ customerId: "agen-1", createdAt: new Date().toISOString(),
      items: [
        { productId: "product-1", name: "Pulpen", transactionPrice: 4049, price: 4049, quantity: 1 },
        { productId: "product-1", name: "Pulpen", transactionPrice: 4050, price: 4050, quantity: 1 },
      ], amountPaid: 8500, originalSubtotal: 8099, originalTotal: 8099,
    })]));
    expect((await response.json()).results[0]).toMatchObject({ status: "PENDING_APPROVAL" });
    expect(transactionCreateMock.mock.calls[0][0].data.items.create).toEqual([
      expect.objectContaining({ unitPrice: 4000, appliedUnitPrice: 4000, subtotal: 4000 }),
      expect.objectContaining({ unitPrice: 4500, appliedUnitPrice: 4500, subtotal: 4500 }),
    ]);
  });
  it.each([
    { enabled: true, custom: undefined, expected: 4000 },
    { enabled: true, custom: 4050, expected: 4500 },
    { enabled: false, custom: 4050, expected: 4050 },
  ])("reprices offline amounts and snapshots with policy $enabled and custom $custom", async ({ enabled, custom, expected }) => {
    roundingSettingsMock.mockResolvedValue({ enabled, increment: 500, threshold: 50 });
    customerFindFirstMock.mockResolvedValue({ id: "customer-1", type: "INDUSTRI" });
    const original = (await productFindManyMock())[0];
    productFindManyMock.mockResolvedValue([{ ...original, price: 4049 }]);
    const response = await POST(request([offlineTx({ createdAt: new Date().toISOString(), customerId: "customer-1",
      items: [{ productId: "product-1", name: "Kertas", price: 4049, transactionPrice: custom, quantity: 2, discount: 100 }],
      amountPaid: 20000, originalSubtotal: 7998, originalTotal: 7998,
    })]));
    expect(response.status).toBe(200);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ subtotal: expected * 2 - 100, total: expected * 2 - 100,
      items: { create: [expect.objectContaining({ unitPrice: expected, appliedUnitPrice: expected, subtotal: expected * 2 - 100, discount: 100 })] },
    });
  });

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
    expect(response.status).toBe(200);
    expect((await response.json()).results[0]).toMatchObject({ status: "FAILED_FINAL" });
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
    canRolePerformActionMock.mockReset().mockReturnValue(true);
    specialPricingSettingsMock.mockResolvedValue({ specialPricingEnabled: true });
    roundingSettingsMock.mockResolvedValue({ enabled: false, increment: 500, threshold: 50 });
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
    shiftUpdateManyMock.mockResolvedValue({ count: 1 });
    shiftFindFirstMock.mockReset().mockResolvedValue(null);
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
        cashierShift: { updateMany: shiftUpdateManyMock, findFirst: shiftFindFirstMock },
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
      .mockResolvedValueOnce({ id: "tx-race", status: "COMPLETED", storeId: "store-main", cashierId: "cashier-1", requestedById: null });
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
    const prefix = "INV-20260622-";
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
    const rim = { id: "product-1", storeId: "store-main", name: "Kertas A4", price: 50000, costPrice: 9000, unit: "rim", stock: 10, stockGroupId: "paper", unitMultiplierToBase: 1, stockGroup: { id: "paper", baseStock: 10, baseUnit: "pcs", storeId: "store-main" }, categoryId: "cat-paper", category: { name: "Kertas" }, brandId: null, brand: null };
    productFindManyMock.mockImplementation(async (args: any) => args.where.OR ? [{ ...rim, stockGroup: { baseUnit: "pcs", storeId: "store-main" } }, { ...rim, id: "base-pcs", unit: "pcs", costPrice: baseCost, stockGroup: { baseUnit: "pcs", storeId: "store-main" } }] : [rim]);
    pricingRuleFindManyMock.mockResolvedValue([{ id: "formula-paper", categoryId: "cat-paper", category: { name: "Kertas" }, customerType: "PEMERINTAH", customerTypes: ["UMUM", "AGEN"], unit: "rim", brandId: null, brand: null, mode: "COST_PLUS_FLAT", value: 4000, isActive: true }]);
    productCostFindManyMock.mockResolvedValue([{ id: "product-1", costPrice: 9000 }]);
    const response = await POST(request([offlineTx({ createdAt: new Date().toISOString(), items: [{ productId: "product-1", name: "Kertas A4", price: rimPrice, quantity: 2 }], amountPaid: rimPrice * 2, originalSubtotal: rimPrice * 2, originalTotal: rimPrice * 2 })]));
    expect(response.status).toBe(200);
    expect(transactionCreateMock.mock.calls[0][0].data.items.create[0]).toMatchObject({ unitPrice: rimPrice, subtotal: rimPrice * 2, pricingRuleId: "formula-paper" });
    expect(inventoryLogCreateManyMock.mock.calls[0][0].data[0].unitCost).toBe(9000);
  });

});
