import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const afterMock = vi.hoisted(() => vi.fn());
const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const applyProductStockDeltasMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const customerFindFirstMock = vi.hoisted(() => vi.fn());
const salespersonFindFirstMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const pricingRuleFindManyMock = vi.hoisted(() => vi.fn());
const transactionCountMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const transactionCreateMock = vi.hoisted(() => vi.fn());

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
    dbTransactionMock.mockImplementation(async (cb: any) => cb({
      transaction: { create: transactionCreateMock },
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
