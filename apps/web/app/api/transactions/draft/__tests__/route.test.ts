import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const roundingSettingsMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/product-price-rounding/server/rounding-settings", () => ({ getPriceRoundingSettings: roundingSettingsMock }));

const requirePermissionMock = vi.hoisted(() => vi.fn());
const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const customerFindFirstMock = vi.hoisted(() => vi.fn());
const salespersonFindFirstMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const pricingRuleFindManyMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const transactionCreateMock = vi.hoisted(() => vi.fn());
const productPriceLogCreateManyMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const canRolePerformActionMock = vi.hoisted(() => vi.fn());
const getGlobalRolePermissionsMock = vi.hoisted(() => vi.fn());
const invoiceNowMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/invoice-date/services/internet-clock", () => ({ getInvoiceNow: invoiceNowMock }));

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  requireRole: requireRoleMock,
  handleAuthError: handleAuthErrorMock,
  AuthError: class AuthError extends Error {
    public statusCode: number;
    constructor(statusCode: number, message?: string) {
      super(message || "auth");
      this.statusCode = statusCode;
    }
  },
}));

vi.mock("@/features/rbac/helpers/rbac-core", () => ({
  canRolePerformAction: canRolePerformActionMock,
}));

vi.mock("@/features/rbac/helpers/rbac-server", () => ({
  getGlobalRolePermissions: getGlobalRolePermissionsMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    customer: { findFirst: customerFindFirstMock },
    salesperson: { findFirst: salespersonFindFirstMock },
    product: { findMany: productFindManyMock },
    categoryCustomerPricingRule: { findMany: pricingRuleFindManyMock },
    transaction: {
      findMany: transactionFindManyMock,
      create: transactionCreateMock,
    },
    productPriceLog: { createMany: productPriceLogCreateManyMock },
    $transaction: dbTransactionMock,
  },
  Prisma: {},
}));

describe("POST /api/transactions/draft", () => {
  it.each([
    { enabled: true, custom: undefined, expected: 4000 },
    { enabled: true, custom: 4050, expected: 4500 },
    { enabled: false, custom: 4050, expected: 4050 },
  ])("stores final rounded prices with policy $enabled and custom $custom", async ({ enabled, custom, expected }) => {
    roundingSettingsMock.mockResolvedValue({ enabled, increment: 500, threshold: 50 });
    const original = (await productFindManyMock())[0];
    productFindManyMock.mockResolvedValue([{ ...original, price: 4049 }]);
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft", { method: "POST", body: JSON.stringify({
      paymentMethod: "CASH", amountPaid: 20000,
      items: [{ productId: "p1", name: "Kertas", price: 4049, transactionPrice: custom, quantity: 2, discount: 100 }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ subtotal: expected * 2 - 100, total: expected * 2 - 100,
      items: { create: [expect.objectContaining({ unitPrice: expected, appliedUnitPrice: expected, subtotal: expected * 2 - 100, discount: 100 })] },
    });
  });

  it("stores a trimmed document name separately from the server product name", async () => {
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft", { method: "POST", body: JSON.stringify({
      items: [{ productId: "p1", name: "Client supplied name", documentName: "  Kertas untuk rapat  ", price: 50000, quantity: 2 }],
    }) }));
    expect(response.status).toBe(201);
    const stored = transactionCreateMock.mock.calls[0][0];
    expect(stored.data).toMatchObject({ subtotal: 100000, total: 100000,
      items: { create: [expect.objectContaining({ productId: "p1", productName: "Kertas A4", documentName: "Kertas untuk rapat", quantity: 2, unitPrice: 50000 })] },
    });
    expect(stored.include.items.select.documentName).toBe(true);
  });

  it.each([undefined, null])("keeps the original POS name when the document name is %s", async documentName => {
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft", { method: "POST", body: JSON.stringify({
      items: [{ productId: "p1", name: "Kertas A4", documentName, price: 50000, quantity: 1 }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data.items.create[0]).toMatchObject({ productName: "Kertas A4", documentName: null });
  });

  it.each(["", "   ", "A".repeat(301), true, 10, {}])("rejects invalid document name %j without creating a draft", async documentName => {
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft", { method: "POST", body: JSON.stringify({
      items: [{ productId: "p1", name: "Kertas A4", documentName, price: 50000, quantity: 1 }],
    }) }));
    expect(response.status).toBe(422);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it.each([
    ["single character", "A", "A"],
    ["exact maximum", "A".repeat(300), "A".repeat(300)],
    ["trimmed maximum", ` \t${"A".repeat(300)}\n `, "A".repeat(300)],
    ["Unicode and supplier punctuation", "Amplop Café / 110 (包)", "Amplop Café / 110 (包)"],
    ["literal markup", '<b>Amplop & "Putih"</b>', '<b>Amplop & "Putih"</b>'],
  ])("creates a draft with %s without changing its POS identity", async (_description, documentName, expectedName) => {
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft", {
      method: "POST",
      body: JSON.stringify({ items: [{ productId: "p1", name: "Nama dari klien", documentName, price: 47500, transactionPrice: 47500, quantity: 3 }] }),
    }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock).toHaveBeenCalledTimes(1);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({
      subtotal: 142500, total: 142500,
      items: { create: [expect.objectContaining({ productId: "p1", productName: "Kertas A4", documentName: expectedName, quantity: 3, unitPrice: 47500 })] },
    });
    expect(productPriceLogCreateManyMock).not.toHaveBeenCalled();
  });

  it("rejects a later invalid name before creating any part of the draft", async () => {
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft", {
      method: "POST",
      body: JSON.stringify({ items: [
        { productId: "p1", name: "Kertas A4", documentName: "Untuk rapat", price: 50000, quantity: 1 },
        { productId: "p1", name: "Kertas A4", documentName: "\u00a0\t\n", price: 50000, quantity: 2 },
      ] }),
    }));
    expect(response.status).toBe(422);
    expect(transactionCreateMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("keeps distinct document names on repeated product lines", async () => {
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft", { method: "POST", body: JSON.stringify({
      items: [
        { productId: "p1", name: "Kertas A4", documentName: "Untuk rapat", price: 50000, quantity: 1 },
        { productId: "p1", name: "Kertas A4", documentName: "Untuk arsip", price: 50000, quantity: 2 },
      ],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data.items.create).toEqual([
      expect.objectContaining({ productName: "Kertas A4", documentName: "Untuk rapat", quantity: 1 }),
      expect.objectContaining({ productName: "Kertas A4", documentName: "Untuk arsip", quantity: 2 }),
    ]);
  });

  it.each([0.001, 50000.01, true, {}])("rejects malformed or over-precise draft discount %j", async discount => {
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft", { method: "POST", body: JSON.stringify({
      items: [{ productId: "p1", name: "Kertas A4", price: 50000, quantity: 1, discount }],
    }) }));
    expect(response.status).toBe(422);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it("saves a fully discounted draft while keeping its gross unit price", async () => {
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft", { method: "POST", body: JSON.stringify({
      items: [{ productId: "p1", name: "Kertas A4", price: 50000, quantity: 2, discount: 100000 }],
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ subtotal: 0, total: 0, status: "DRAFT",
      items: { create: [expect.objectContaining({ unitPrice: 50000, quantity: 2, discount: 100000, subtotal: 0 })] },
    });
  });

  it("keeps separate discounts on repeated products in a draft", async () => {
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft", { method: "POST", body: JSON.stringify({
      items: [
        { productId: "p1", name: "Kertas A4", price: 50000, quantity: 1, discount: 5000 },
        { productId: "p1", name: "Kertas A4", price: 50000, quantity: 2, discount: 10000 },
      ], discount: 15000,
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({ subtotal: 135000, discount: 15000, total: 120000,
      items: { create: [expect.objectContaining({ discount: 5000, subtotal: 45000 }), expect.objectContaining({ discount: 10000, subtotal: 90000 })] },
    });
  });

  it.each([-1, 50001, "100", null])("rejects invalid draft line discount %s", async discount => {
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft", { method: "POST", body: JSON.stringify({
      items: [{ productId: "p1", name: "Kertas A4", price: 50000, quantity: 1, discount }],
    }) }));
    expect(response.status).toBe(422);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it("saves the item discount once for the whole line and keeps the invoice discount separate", async () => {
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft", { method: "POST", body: JSON.stringify({
      items: [{ productId: "p1", name: "Kertas A4", price: 50000, quantity: 3, discount: 5000 }], discount: 10000,
    }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data).toMatchObject({
      subtotal: 145000, discount: 10000, total: 135000,
      items: { create: [expect.objectContaining({ unitPrice: 50000, discount: 5000, subtotal: 145000 })] },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    roundingSettingsMock.mockResolvedValue({ enabled: false, increment: 500, threshold: 50 });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T03:00:00.000Z"));
    invoiceNowMock.mockImplementation(async () => new Date());
    requireRoleMock.mockResolvedValue({
      id: "cashier-1",
      role: "CASHIER",
      storeId: "store-main",
      name: "Cashier One",
    });
    handleAuthErrorMock.mockReturnValue(null);
    canRolePerformActionMock.mockReturnValue(true);
    getGlobalRolePermissionsMock.mockResolvedValue({});
    customerFindFirstMock.mockResolvedValue(null);
    salespersonFindFirstMock.mockResolvedValue(null);
    productFindManyMock.mockResolvedValue([
      {
        id: "p1",
        name: "Kertas A4",
        price: 50000,
        costPrice: 30000,
        hargaAgen: null,
        hargaDinas: null,
        size: null,
        material: null,
        unit: "Rim",
        categoryId: "cat-paper",
        category: { name: "Kertas" },
        brandId: null,
        brand: null,
      },
    ]);
    pricingRuleFindManyMock.mockResolvedValue([]);
    transactionFindManyMock.mockResolvedValue([]);
    dbTransactionMock.mockImplementation(async (callback: any) =>
      callback({
        transaction: {
          create: transactionCreateMock,
        },
        productPriceLog: { createMany: productPriceLogCreateManyMock },
      }),
    );
    transactionCreateMock.mockImplementation(async ({ data }: any) => ({
      id: "draft-1",
      draftNumber: data.draftNumber,
      invoiceNumber: data.invoiceNumber,
      status: data.status,
      storeId: data.storeId,
      cashierId: data.cashierId,
      requestedById: data.requestedById,
      items: [
        {
          productId: "p1",
          productName: "Kertas A4",
          quantity: 2,
          unitPrice: 50000,
          subtotal: 100000,
        },
      ],
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores a trimmed custom draft number", async () => {
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost/api/transactions/draft", {
      method: "POST",
      body: JSON.stringify({ items: [{ productId: "p1", name: "Kertas A4", price: 50000, quantity: 1 }], draftNumber: "  CUSTOM/001  " }),
    }));
    expect(res.status).toBe(201);
    expect((await res.json()).draftNumber).toBe("CUSTOM/001");
  });

  it("uses automatic numbering for a blank custom number", async () => {
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost/api/transactions/draft", {
      method: "POST",
      body: JSON.stringify({ items: [{ productId: "p1", name: "Kertas A4", price: 50000, quantity: 1 }], draftNumber: "   " }),
    }));
    expect(res.status).toBe(201);
    expect((await res.json()).draftNumber).toBe("PNW-TLD-20260602-001");
  });

  it("normalizes pasted display numbers so the database can detect duplicates", async () => {
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost/api/transactions/draft", {
      method: "POST",
      body: JSON.stringify({ items: [{ productId: "p1", name: "Kertas A4", price: 50000, quantity: 1 }], draftNumber: "001/PNW-TLD/02/VI/2026" }),
    }));
    expect(res.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data.draftNumber).toBe("PNW-TLD-20260602-001");
  });

  it("rejects a pasted display number already used by an automatic draft", async () => {
    transactionCreateMock.mockImplementation(async ({ data }: any) => {
      if (data.draftNumber === "PNW-TLD-20260602-001") throw { code: "P2002", meta: { target: ["draftNumber"] } };
      return { id: "draft-1", ...data };
    });
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost/api/transactions/draft", {
      method: "POST",
      body: JSON.stringify({ items: [{ productId: "p1", name: "Kertas A4", price: 50000, quantity: 1 }], draftNumber: "001/PNW-TLD/02/VI/2026" }),
    }));
    expect(res.status).toBe(409);
    expect(transactionCreateMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a custom number longer than 100 characters", async () => {
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost/api/transactions/draft", {
      method: "POST",
      body: JSON.stringify({ items: [{ productId: "p1", name: "Kertas A4", price: 50000, quantity: 1 }], draftNumber: "A".repeat(101) }),
    }));
    expect(res.status).toBe(422);
    expect(transactionCreateMock).not.toHaveBeenCalled();
  });

  it("rejects a short raw PNW suffix that prints like an existing automatic number", async () => {
    transactionCreateMock.mockImplementation(async ({ data }: any) => {
      if (data.draftNumber === "PNW-TLD-20260602-001") throw { code: "P2002", meta: { target: ["draftNumber"] } };
      return { id: "draft-1", ...data };
    });
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost/api/transactions/draft", {
      method: "POST",
      body: JSON.stringify({ items: [{ productId: "p1", name: "Kertas A4", price: 50000, quantity: 1 }], draftNumber: "PNW-TLD-20260602-1" }),
    }));
    expect(res.status).toBe(409);
  });

  it("returns a helpful conflict without retrying a duplicate manual number", async () => {
    transactionCreateMock.mockRejectedValueOnce({ code: "P2002", meta: { target: ["draftNumber"] } });
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost/api/transactions/draft", {
      method: "POST",
      body: JSON.stringify({ items: [{ productId: "p1", name: "Kertas A4", price: 50000, quantity: 1 }], draftNumber: "CUSTOM/001" }),
    }));
    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain("sudah digunakan");
    expect(transactionCreateMock).toHaveBeenCalledTimes(1);
  });

  it("retries an automatic number collision", async () => {
    transactionCreateMock.mockRejectedValueOnce({ code: "P2002", meta: { target: ["draftNumber"] } });
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost/api/transactions/draft", {
      method: "POST",
      body: JSON.stringify({ items: [{ productId: "p1", name: "Kertas A4", price: 50000, quantity: 1 }] }),
    }));
    expect(res.status).toBe(201);
    expect((await res.json()).draftNumber).toBe("PNW-TLD-20260602-002");
    expect(transactionCreateMock).toHaveBeenCalledTimes(2);
  });

  it("starts automatic numbering after the largest manual sequence", async () => {
    transactionFindManyMock.mockResolvedValue(Array.from({ length: 14 }, (_, index) => ({ draftNumber: `PNW-TLD-20260602-${String(index + 7).padStart(3, "0")}` })));
    const { POST } = await import("../route");
    const res = await POST(new Request("http://localhost/api/transactions/draft", {
      method: "POST",
      body: JSON.stringify({ items: [{ productId: "p1", name: "Kertas A4", price: 50000, quantity: 1 }] }),
    }));
    expect(res.status).toBe(201);
    expect((await res.json()).draftNumber).toBe("PNW-TLD-20260602-021");
  });

  it("previews a free number after sparse manual sequences", async () => {
    transactionFindManyMock.mockResolvedValue(Array.from({ length: 14 }, (_, index) => ({ draftNumber: `PNW-TLD-20260602-${String(index + 7).padStart(3, "0")}` })));
    const { GET } = await import("../route");
    const res = await GET(new Request("http://localhost/api/transactions/draft"));
    expect(res.status).toBe(200);
    expect((await res.json()).draftNumber).toBe("PNW-TLD-20260602-021");
  });

  it("previews the automatic number without creating a transaction", async () => {
    transactionFindManyMock.mockResolvedValue([{ draftNumber: "PNW-TLD-20260602-007" }]);
    const route = await import("../route") as Record<string, any>;
    expect(route.GET).toBeTypeOf("function");
    const res = await route.GET(new Request("http://localhost/api/transactions/draft"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ draftNumber: "PNW-TLD-20260602-008" });
    expect(transactionCreateMock).not.toHaveBeenCalled();
    expect(transactionFindManyMock).toHaveBeenCalledWith({ where: { storeId: "store-main", draftNumber: { startsWith: "PNW-TLD-20260602-" } }, select: { draftNumber: true } });
  });

  it("previews a selected invoice date for an admin", async () => {
    requireRoleMock.mockResolvedValue({ id: "admin-1", role: "ADMIN", storeId: "store-main" });
    const route = await import("../route") as Record<string, any>;
    expect(route.GET).toBeTypeOf("function");
    const res = await route.GET(new Request("http://localhost/api/transactions/draft?date=2026-06-01"));
    expect(res.status).toBe(200);
    expect((await res.json()).draftNumber).toBe("PNW-TLD-20260601-001");
  });

  it("rejects an invalid preview date", async () => {
    const route = await import("../route") as Record<string, any>;
    expect(route.GET).toBeTypeOf("function");
    const res = await route.GET(new Request("http://localhost/api/transactions/draft?date=2026-02-30"));
    expect(res.status).toBe(422);
    expect(transactionFindManyMock).not.toHaveBeenCalled();
  });

  it("checks draft create permission before previewing a number", async () => {
    canRolePerformActionMock.mockReturnValue(false);
    handleAuthErrorMock.mockImplementation((err: any) => new Response(JSON.stringify({ message: err.message }), { status: err.statusCode }));
    const route = await import("../route") as Record<string, any>;
    expect(route.GET).toBeTypeOf("function");
    const res = await route.GET(new Request("http://localhost/api/transactions/draft"));
    expect(res.status).toBe(403);
    expect(transactionFindManyMock).not.toHaveBeenCalled();
  });

  it("creates a DRAFT row with PNW draftNumber, null invoiceNumber, no stock decrement", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { productId: "p1", name: "Kertas A4", price: 50000, quantity: 2 },
          ],
          discount: 0,
          isJobOrder: false,
        }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("DRAFT");
    expect(body.invoiceNumber).toBeNull();
    expect(body.draftNumber).toBe("PNW-TLD-20260602-001");
    expect(transactionCreateMock).toHaveBeenCalledTimes(1);
    const createArgs = transactionCreateMock.mock.calls[0][0];
    expect(createArgs.data.status).toBe("DRAFT");
    expect(createArgs.data.invoiceNumber).toBeNull();
    expect(createArgs.data.cashierId).toBe("cashier-1");
    expect(createArgs.data.requestedById).toBeNull();
  }, 30000);

  it("uses the synchronized source for the default draft invoice date", async () => {
    invoiceNowMock.mockResolvedValue(new Date("2030-01-02T20:00:00Z"));
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft", { method: "POST", body: JSON.stringify({ items: [{ productId: "p1", name: "Kertas A4", price: 50000, quantity: 2 }], discount: 0 }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data.invoiceDate).toEqual(new Date("2030-01-02T20:00:00Z"));
  });

  it("stores explicit transaction prices without changing product master prices", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              productId: "p1",
              name: "Kertas A4",
              price: 47500,
              transactionPrice: 47500,
              quantity: 3,
            },
          ],
          discount: 0,
          customerName: "PT Contoh",
          isJobOrder: false,
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect(transactionCreateMock).toHaveBeenCalledTimes(1);
    const createArgs = transactionCreateMock.mock.calls[0][0];
    expect(createArgs.data.subtotal).toBe(142500);
    expect(createArgs.data.total).toBe(142500);
    expect(createArgs.data.customerName).toBe("PT Contoh");
    expect(createArgs.data.items.create).toEqual([
      expect.objectContaining({
        productId: "p1",
        productName: "Kertas A4",
        quantity: 3,
        unitPrice: 47500,
        unitCost: 30000,
        subtotal: 142500,
      }),
    ]);
    expect(createArgs.data).not.toHaveProperty("price");
    expect(productPriceLogCreateManyMock).not.toHaveBeenCalled();
  }, 30000);

  it("returns 422 when cart is empty", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({ items: [], discount: 0, isJobOrder: false }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when a product id does not exist", async () => {
    productFindManyMock.mockResolvedValue([]);
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { productId: "missing", name: "x", price: 1, quantity: 1 },
          ],
          discount: 0,
          isJobOrder: false,
        }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("flags a SALES draft with requestedById and null cashierId", async () => {
    requireRoleMock.mockResolvedValue({
      id: "sales-1",
      role: "SALES",
      storeId: "store-main",
      name: "Sales One",
    });
    const { POST } = await import("../route");
    await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { productId: "p1", name: "Kertas A4", price: 50000, quantity: 2 },
          ],
          discount: 0,
          isJobOrder: false,
        }),
      }),
    );
    const createArgs = transactionCreateMock.mock.calls[0][0];
    expect(createArgs.data.cashierId).toBeNull();
    expect(createArgs.data.requestedById).toBe("sales-1");
  });

  it("lets OWNER create a draft with a custom invoice date and matching draft number date", async () => {
    requireRoleMock.mockResolvedValue({
      id: "owner-1",
      role: "OWNER",
      storeId: "store-main",
      name: "Owner One",
    });
    transactionFindManyMock.mockResolvedValue([{ draftNumber: "PNW-TLD-20260701-004" }]);
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { productId: "p1", name: "Kertas A4", price: 50000, quantity: 2 },
          ],
          discount: 0,
          isJobOrder: false,
          invoiceDate: "2026-07-01",
          invoiceTime: "14:05",
          invoiceDateReason: "Nota penawaran susulan dari arsip manual",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const createArgs = transactionCreateMock.mock.calls[0][0];
    expect(createArgs.data.invoiceDate.toISOString()).toBe(
      "2026-07-01T07:05:00.000Z",
    );
    expect(createArgs.data.draftNumber).toBe("PNW-TLD-20260701-005");
    expect(transactionFindManyMock).toHaveBeenCalledWith({
      where: {
        storeId: "store-main",
        draftNumber: { startsWith: "PNW-TLD-20260701-" },
      },
      select: { draftNumber: true },
    });
  });

  it("reprices new drafts from server rules without a legacy priority field", async () => {
    customerFindFirstMock.mockResolvedValue({
      id: "agen-1",
      type: "AGEN",
    });
    productFindManyMock.mockResolvedValue([
      {
        id: "p1",
        name: "Pulpen",
        price: 100000,
        costPrice: 50000,
        hargaAgen: 95000,
        hargaDinas: null,
        size: null,
        material: null,
        unit: "pcs",
        categoryId: "cat-atk",
        category: { name: "ATK" },
        brandId: null,
        brand: null,
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
        value: 10,
        isActive: true,
        updatedAt: new Date("2026-07-03T00:00:00.000Z"),
        category: { name: "ATK" },
      },
    ]);

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { productId: "p1", name: "Pulpen", price: 95000, quantity: 1 },
          ],
          discount: 0,
          customerId: "agen-1",
          isJobOrder: false,
        }),
      }),
    );

    expect(res.status).toBe(201);
    const createArgs = transactionCreateMock.mock.calls[0][0];
    expect(createArgs.data.items.create[0]).toEqual(
      expect.objectContaining({
        unitPrice: 90000,
        pricingRuleId: "rule-atk",
        originalUnitPrice: 100000,
        appliedUnitPrice: 90000,
      }),
    );
    expect(productPriceLogCreateManyMock).not.toHaveBeenCalled();
  });

  it("keeps an explicit transaction price over automatic draft pricing without changing the product price", async () => {
    customerFindFirstMock.mockResolvedValue({
      id: "agen-1",
      type: "AGEN",
    });
    productFindManyMock.mockResolvedValue([
      {
        id: "p1",
        name: "Pulpen",
        price: 100000,
        costPrice: 50000,
        hargaAgen: 95000,
        hargaDinas: null,
        size: null,
        material: null,
        unit: "pcs",
        categoryId: "cat-atk",
        category: { name: "ATK" },
        brandId: null,
        brand: null,
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
        value: 10,
        isActive: true,
        updatedAt: new Date("2026-07-03T00:00:00.000Z"),
        category: { name: "ATK" },
      },
    ]);

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              productId: "p1",
              name: "Pulpen",
              price: 80000,
              transactionPrice: 80000,
              quantity: 1,
            },
          ],
          discount: 0,
          customerId: "agen-1",
          isJobOrder: false,
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect(pricingRuleFindManyMock).toHaveBeenCalledWith({
      where: { storeId: "store-main", isActive: true },
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
      },
    });
    const createArgs = transactionCreateMock.mock.calls[0][0];
    expect(createArgs.data.items.create[0]).toEqual(
      expect.objectContaining({
        unitPrice: 80000,
        pricingRuleId: "rule-atk",
        appliedUnitPrice: 80000,
      }),
    );
    expect(productPriceLogCreateManyMock).not.toHaveBeenCalled();
  });

  it("keeps an explicit transaction price above automatic draft pricing", async () => {
    customerFindFirstMock.mockResolvedValue({
      id: "agen-1",
      type: "AGEN",
    });
    productFindManyMock.mockResolvedValue([
      {
        id: "p1",
        name: "Pulpen",
        price: 100000,
        costPrice: 50000,
        hargaAgen: 95000,
        hargaDinas: null,
        size: null,
        material: null,
        unit: "pcs",
        categoryId: "cat-atk",
        category: { name: "ATK" },
        brandId: null,
        brand: null,
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
        value: 10,
        isActive: true,
        updatedAt: new Date("2026-07-03T00:00:00.000Z"),
        category: { name: "ATK" },
      },
    ]);

    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              productId: "p1",
              name: "Pulpen",
              price: 80000,
              transactionPrice: 80000,
              quantity: 1,
            },
          ],
          discount: 0,
          customerId: "agen-1",
          pricingPreference: "SPECIAL",
          isJobOrder: false,
        }),
      }),
    );

    expect(res.status).toBe(201);
    const createArgs = transactionCreateMock.mock.calls[0][0];
    expect(createArgs.data.items.create[0]).toEqual(
      expect.objectContaining({
        unitPrice: 80000,
        pricingRuleId: "rule-atk",
        appliedUnitPrice: 80000,
      }),
    );
  });

  it("rejects a custom invoice date from CASHIER when creating a draft", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { productId: "p1", name: "Kertas A4", price: 50000, quantity: 2 },
          ],
          discount: 0,
          isJobOrder: false,
          invoiceDate: "2026-07-01",
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

  it("returns 403 when role lacks transaction.draft:create permission", async () => {
    canRolePerformActionMock.mockReturnValue(false);
    handleAuthErrorMock.mockImplementation((err: any) => {
      if (err && err.statusCode === 403) {
        return new Response(JSON.stringify({ message: "Forbidden" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return null;
    });
    const { POST } = await import("../route");
    const res = await POST(
      new Request("http://localhost/api/transactions/draft", {
        method: "POST",
        body: JSON.stringify({
          items: [
            { productId: "p1", name: "Kertas A4", price: 50000, quantity: 2 },
          ],
          discount: 0,
          isJobOrder: false,
        }),
      }),
    );
    expect(res.status).toBe(403);
  });
  it.each([[700, 4700], [800, 4800]])("uses current base modal %i for Rim price %i and preserves accounting cost", async (baseCost, rimPrice) => {
    const rim = { id: "p1", storeId: "store-main", name: "Kertas A4", price: 50000, costPrice: 9000, unit: "rim", stock: 10, stockGroupId: "paper", categoryId: "cat-paper", category: { name: "Kertas" }, brandId: null, brand: null };
    productFindManyMock.mockImplementation(async (args: any) => args.where.OR ? [{ ...rim, stockGroup: { baseUnit: "pcs", storeId: "store-main" } }, { ...rim, id: "base-pcs", unit: "pcs", costPrice: baseCost, stockGroup: { baseUnit: "pcs", storeId: "store-main" } }] : [rim]);
    pricingRuleFindManyMock.mockResolvedValue([{ id: "formula-paper", categoryId: "cat-paper", category: { name: "Kertas" }, customerType: "PEMERINTAH", customerTypes: ["UMUM", "AGEN"], unit: "rim", brandId: null, brand: null, mode: "COST_PLUS_FLAT", value: 4000, isActive: true }]);
    const { POST } = await import("../route");
    const response = await POST(new Request("http://localhost/api/transactions/draft", { method: "POST", body: JSON.stringify({ items: [{ productId: "p1", name: "Kertas A4", price: rimPrice, quantity: 2 }], discount: 0 }) }));
    expect(response.status).toBe(201);
    expect(transactionCreateMock.mock.calls[0][0].data.items.create[0]).toMatchObject({ unitPrice: rimPrice, subtotal: rimPrice * 2, pricingRuleId: "formula-paper" });
    expect(transactionCreateMock.mock.calls[0][0].data.items.create[0].unitCost).toBe(9000);
  });

});
