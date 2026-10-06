import { beforeEach, describe, expect, it, vi } from "vitest";
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
const pricingRuleFindManyMock = vi.hoisted(() => vi.fn());
const transactionCountMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const transactionCreateMock = vi.hoisted(() => vi.fn());
const transactionInventoryLogCreateManyMock = vi.hoisted(() => vi.fn());
const customerUpdateMock = vi.hoisted(() => vi.fn());
const invoiceNowMock = vi.hoisted(() => vi.fn());
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
    customer: { findFirst: customerFindFirstMock },
    salesperson: { findFirst: salespersonFindFirstMock },
    product: {
      findMany: productFindManyMock,
    },
    categoryCustomerPricingRule: { findMany: pricingRuleFindManyMock },
    transaction: {
      count: transactionCountMock,
      findMany: transactionFindManyMock,
      create: transactionCreateMock,
    },
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

describe("POST /api/transactions negative stock", () => {
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
    transactionCreateMock.mockResolvedValue({ id: "tx-1", status: "COMPLETED" });
    buildInventoryLogRowsMock.mockReturnValue([]);
    transactionInventoryLogCreateManyMock.mockResolvedValue({ count: 0 });
    dbTransactionMock.mockImplementation(async (cb: any) => cb({
      transaction: { create: transactionCreateMock },
      transactionItemSnapshot: { createMany: vi.fn() },
      inventoryLog: { createMany: transactionInventoryLogCreateManyMock },
      customer: { update: customerUpdateMock },
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

  it("recalculates with Harga Khusus as the default priority", async () => {
    const response = await createAgenPricingTransaction("SPECIAL");

    expect(response.status).toBe(201);
    const createArg = transactionCreateMock.mock.calls[0][0];
    expect(createArg.data.items.create[0]).toEqual(
      expect.objectContaining({
        unitPrice: 90000,
        pricingRuleId: "rule-atk",
      }),
    );
  });

  it("keeps Harga Khusus primary when a legacy MEMBER preference is selected", async () => {
    const response = await createAgenPricingTransaction("MEMBER");

    expect(response.status).toBe(201);
    const createArg = transactionCreateMock.mock.calls[0][0];
    expect(createArg.data.items.create[0]).toEqual(
      expect.objectContaining({
        unitPrice: 90000,
        pricingRuleId: "rule-atk",
        appliedUnitPrice: 90000,
      }),
    );
  });

  it("applies Harga Khusus when new transaction requests omit the priority field", async () => {
    const response = await createAgenPricingTransaction();

    expect(response.status).toBe(201);
    const createArg = transactionCreateMock.mock.calls[0][0];
    expect(createArg.data.items.create[0]).toEqual(
      expect.objectContaining({
        unitPrice: 90000,
        pricingRuleId: "rule-atk",
        appliedUnitPrice: 90000,
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
});
