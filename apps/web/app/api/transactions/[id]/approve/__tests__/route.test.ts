import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const afterMock = vi.hoisted(() => vi.fn());
const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const transactionUpdateManyMock = vi.hoisted(() => vi.fn());
const transactionUpdateMock = vi.hoisted(() => vi.fn());
const transactionFindUniqueOrThrowMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const productUpdateManyMock = vi.hoisted(() => vi.fn());
const queryRawMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateManyMock = vi.hoisted(() => vi.fn());
const customerUpdateMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const buildApprovalQuoteMock = vi.hoisted(() => vi.fn());
const canRolePerformActionMock = vi.hoisted(() => vi.fn());
const getGlobalRolePermissionsMock = vi.hoisted(() => vi.fn());
const paymentDeleteManyMock = vi.hoisted(() => vi.fn());
const paymentCreateManyMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/invoice-date/services/internet-clock", () => ({ getInvoiceNow: async () => new Date() }));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: afterMock,
  };
});

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    transaction: {
      findFirst: transactionFindFirstMock,
      findMany: transactionFindManyMock,
    },
    inventoryLog: {
      createMany: inventoryLogCreateManyMock,
    },
    customer: {
      update: customerUpdateMock,
    },
    $transaction: dbTransactionMock,
  },
  Prisma: {
    empty: "",
    sql: vi.fn().mockReturnValue(""),
  },
}));

vi.mock("@/features/transactions-draft/services/approval-quote", () => ({
  buildApprovalQuote: buildApprovalQuoteMock,
}));

vi.mock("@/features/rbac/helpers/rbac-core", () => ({
  buildDefaultRolePermissions: vi.fn(() => ({})),
  canRolePerformAction: canRolePerformActionMock,
}));

vi.mock("@/features/rbac/helpers/rbac-server", () => ({
  getGlobalRolePermissions: getGlobalRolePermissionsMock,
}));

describe("POST /api/transactions/[id]/approve", () => {
  it.each(["SPANDUK", "PERCETAKAN", "PLAT", "STEMPEL", "PRINT"])(
    "menolak pembayaran persetujuan %s yang melampaui kapasitas nota",
    async (printingSubcategory) => {
      const current = await transactionFindFirstMock();
      transactionFindFirstMock.mockResolvedValue({ ...current, printingSubcategory, items: [], payments: [] });
      const response = await POST(new Request("http://localhost/api/transactions/tx-1/approve", {
        method: "POST", body: JSON.stringify({ amountPaid: 10_000_000_000 }),
      }), { params: Promise.resolve({ id: "tx-1" }) });
      expect(response.status).toBe(422);
      expect(dbTransactionMock).not.toHaveBeenCalled();
      expect(paymentCreateManyMock).not.toHaveBeenCalled();
    },
  );

  it("rejects unknown price intent before writing approval data", async () => {
    const response = await POST(new Request("http://localhost/api/transactions/tx-1/approve", { method: "POST", body: JSON.stringify({
      type: "draft", paymentMethod: "CASH", amountPaid: 10000, quoteFingerprint: "fresh-quote",
      items: [{ productId: "paper", quantity: 1, submittedPrice: 4000, priceIntent: "INVALID" }],
    }) }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(422);
    expect(buildApprovalQuoteMock).not.toHaveBeenCalled();
  });

  it("menolak rincian pembayaran nota di atas batas meskipun selisihnya kurang dari satu sen", async () => {
    const current = await transactionFindFirstMock();
    transactionFindFirstMock.mockResolvedValue({ ...current, printingSubcategory: "PRINT", items: [], payments: [] });
    const response = await POST(new Request("http://localhost/api/transactions/tx-1/approve", {
      method: "POST", body: JSON.stringify({
        amountPaid: 9_999_999_999.99,
        payments: [{ method: "CASH", amount: 9_999_999_999.995 }],
      }),
    }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(422);
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("menyetujui pembayaran nota tepat di batas dan menyimpan kembalian yang benar", async () => {
    const current = await transactionFindFirstMock();
    transactionFindFirstMock.mockResolvedValue({ ...current, printingSubcategory: "PLAT", items: [], payments: [] });
    const response = await POST(new Request("http://localhost/api/transactions/tx-1/approve", {
      method: "POST", body: JSON.stringify({ amountPaid: 9_999_999_999.99 }),
    }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(200);
    const data = transactionUpdateManyMock.mock.calls[0][0].data;
    expect(data.amountPaid).toBe(9_999_999_999.99);
    expect(data.change).toBeCloseTo(9_999_949_999.99, 2);
    expect(paymentCreateManyMock).toHaveBeenCalledWith({ data: [{
      transactionId: "tx-1", method: "TRANSFER", amount: 9_999_999_999.99,
    }] });
  });

  it("preserves receipt lines when approving a printing receipt", async () => {
    transactionFindFirstMock.mockResolvedValue({id:"tx-1",storeId:"store-main",status:"PENDING_APPROVAL",printingSubcategory:"PLAT",
      total:100000,amountPaid:100000,items:[],payments:[]});
    const response=await POST(new Request("http://localhost/api/transactions/tx-1/approve",{method:"POST",body:JSON.stringify({
      items:[{quantity:1,submittedPrice:1}],quoteFingerprint:"forged-quote",amountPaid:1,
    })}),{params:Promise.resolve({id:"tx-1"})});
    expect(response.status).toBe(409);
    expect(buildApprovalQuoteMock).not.toHaveBeenCalled();
    expect(transactionUpdateManyMock).not.toHaveBeenCalled();
  });
  it("rejects approval if tax changed after reading the payment total", async () => {
    transactionFindFirstMock.mockResolvedValue({ id: "tx-1", storeId: "store-main", status: "PENDING_APPROVAL", total: 50000,
      tax: 0, taxRate: null, taxMethod: "STANDARD", amountPaid: 50000, change: 0, paymentMethod: "CASH", customerId: null, items: [], payments: [] });
    transactionUpdateManyMock.mockImplementation(async ({ where }) => ({ count: where.tax === 0 && where.total === 50000 && where.taxRate === null ? 0 : 1 }));
    const response = await POST(new Request("http://localhost/api/transactions/tx-1/approve", {
      method: "POST", body: JSON.stringify({ paymentMethod: "CASH", amountPaid: 50000 }),
    }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(409);
    expect(paymentCreateManyMock).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    buildApprovalQuoteMock.mockReset();
    afterMock.mockImplementation((callback: () => void | Promise<void>) => callback());
    requirePermissionMock.mockResolvedValue({
      id: "cashier-1",
      name: "Cashier One",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    canRolePerformActionMock.mockReturnValue(false);
    getGlobalRolePermissionsMock.mockResolvedValue({});
    transactionFindFirstMock.mockResolvedValue({
      id: "tx-1",
      invoiceNumber: "INV-20260520-0001",
      invoiceDate: new Date("2026-05-20T03:00:00.000Z"),
      storeId: "store-main",
      status: "PENDING_APPROVAL",
      total: 50000,
      paymentMethod: "TRANSFER",
      amountPaid: 50000,
      change: 0,
      customerId: "customer-1",
      items: [
        { productId: "product-1", quantity: 2 },
        { productId: "product-2", quantity: 1 },
      ],
    });
    transactionFindManyMock.mockResolvedValue([]);
    transactionUpdateManyMock.mockResolvedValue({ count: 1 });
    transactionFindUniqueOrThrowMock.mockResolvedValue({
      id: "tx-1",
      status: "COMPLETED",
      items: [],
    });
    productFindManyMock.mockImplementation(async ({ where }) =>
      where.id.in.map((id: string) => ({
        id,
        stock: 100,
        stockGroupId: null,
        unitMultiplierToBase: 1,
        conversionNeedsReview: false,
        stockGroup: null,
      })),
    );
    productUpdateManyMock.mockResolvedValue({ count: 1 });
    queryRawMock.mockImplementation(
      async (_strings: TemplateStringsArray, rowId: string) => [{ id: rowId }],
    );
    inventoryLogCreateMock.mockResolvedValue({});
    inventoryLogCreateManyMock.mockResolvedValue({ count: 2 });
    paymentDeleteManyMock.mockResolvedValue({ count: 0 });
    paymentCreateManyMock.mockResolvedValue({ count: 1 });
    customerUpdateMock.mockResolvedValue({});
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        transaction: {
          updateMany: transactionUpdateManyMock,
          update: transactionUpdateMock,
          findUniqueOrThrow: transactionFindUniqueOrThrowMock,
        },
        product: {
          findMany: productFindManyMock,
          updateMany: productUpdateManyMock,
        },
        inventoryLog: {
          create: inventoryLogCreateMock,
          createMany: inventoryLogCreateManyMock,
        },
        customer: {
          update: customerUpdateMock,
        },
        transactionPayment: { deleteMany: paymentDeleteManyMock, createMany: paymentCreateManyMock },
        $queryRaw: queryRawMock,
      }),
    );
  });

  it("rejects a printing receipt when its saved material unit changes while locking stock", async () => {
    const current = await transactionFindFirstMock();
    transactionFindFirstMock.mockResolvedValue({
      ...current,
      printingSubcategory: "PLAT",
      items: [{
        productId: null,
        productName: "Cetak plat",
        quantity: 1,
        rawMaterialProductId: "paper-1",
        rawMaterialQuantity: 3,
        rawMaterialUnit: "lembar",
      }],
    });
    let materialUnit = "lembar";
    productFindManyMock.mockImplementation(async ({ where }) =>
      where.id.in.map((id: string) => ({
        id, unit: materialUnit, stock: 100, stockGroupId: null,
        unitMultiplierToBase: 1, conversionNeedsReview: false, stockGroup: null,
      })),
    );
    queryRawMock.mockImplementation(async (_strings: TemplateStringsArray, rowId: string) => {
      materialUnit = "rim";
      return [{ id: rowId }];
    });
    let commits = 0;
    const runTransaction = dbTransactionMock.getMockImplementation()!;
    dbTransactionMock.mockImplementation(async (...args) => {
      const result = await runTransaction(...args);
      commits += 1;
      return result;
    });

    const response = await POST(new Request("http://localhost/api/transactions/tx-1/approve", {
      method: "POST", body: JSON.stringify({}),
    }), { params: Promise.resolve({ id: "tx-1" }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ message: expect.stringMatching(/satuan.*bahan/i) });
    expect(queryRawMock).toHaveBeenCalled();
    expect(commits).toBe(0);
    expect(paymentDeleteManyMock).not.toHaveBeenCalled();
    expect(productUpdateManyMock).not.toHaveBeenCalled();
    expect(inventoryLogCreateManyMock).not.toHaveBeenCalled();
  });

  it.each([
    { label: "a matching printing receipt unit", printingSubcategory: "PLAT", currentUnit: "lembar" },
    { label: "an ordinary catalog transaction with an older unit", printingSubcategory: null, currentUnit: "rim" },
  ])("approves $label using its saved material quantity", async ({ printingSubcategory, currentUnit }) => {
    const current = await transactionFindFirstMock();
    transactionFindFirstMock.mockResolvedValue({
      ...current,
      printingSubcategory,
      items: [{
        productId: null, productName: "Cetak plat", quantity: 1,
        rawMaterialProductId: "paper-1", rawMaterialQuantity: 3, rawMaterialUnit: "lembar",
      }],
    });
    productFindManyMock.mockImplementation(async ({ where }) =>
      where.id.in.map((id: string) => ({
        id, unit: currentUnit, stock: 100, stockGroupId: null,
        unitMultiplierToBase: 1, conversionNeedsReview: false, stockGroup: null,
      })),
    );

    const response = await POST(new Request("http://localhost/api/transactions/tx-1/approve", {
      method: "POST", body: JSON.stringify({}),
    }), { params: Promise.resolve({ id: "tx-1" }) });

    expect(response.status).toBe(200);
    if (printingSubcategory) {
      expect(customerUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(transactionUpdateManyMock.mock.invocationCallOrder[0]);
      expect(transactionUpdateManyMock.mock.invocationCallOrder[0]).toBeLessThan(queryRawMock.mock.invocationCallOrder[0]);
    }
    expect(productUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "paper-1", storeId: "store-main" }),
      data: { stock: { increment: -3 } },
    }));
    expect(inventoryLogCreateManyMock).toHaveBeenCalledWith({ data: [expect.objectContaining({
      productId: "paper-1", stockBaseDelta: -3,
    })] });
  });

  it("uses the checkout transaction budget and keeps per-item side effects out of the interactive transaction", async () => {
    const response = await POST(
      new Request("http://localhost/api/transactions/tx-1/approve", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "CASH",
          amountPaid: 50000,
        }),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    expect(dbTransactionMock).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5000,
      timeout: 15000,
    });
    expect(queryRawMock).toHaveBeenCalledTimes(2);
    expect(transactionFindUniqueOrThrowMock).not.toHaveBeenCalled();
    expect(productUpdateManyMock).toHaveBeenCalledTimes(2);
    expect(inventoryLogCreateMock).not.toHaveBeenCalled();
  });

  it("approves a pending transaction without re-entering payment fields", async () => {
    const response = await POST(
      new Request("http://localhost/api/transactions/tx-1/approve", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    expect(transactionUpdateManyMock).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "tx-1", storeId: "store-main", status: "PENDING_APPROVAL", total: 50000 }),
      data: expect.objectContaining({
        status: "COMPLETED",
        cashierId: "cashier-1",
        paymentMethod: "TRANSFER",
        amountPaid: 50000,
        change: 0,
      }),
    });
  });

  it("preserves split tender when the approval modal resubmits unchanged payment fields", async () => {
    const current = await transactionFindFirstMock();
    transactionFindFirstMock.mockResolvedValue({ ...current, payments: [
      { method: "CASH", amount: 20000 },
      { method: "TRANSFER", amount: 30000 },
    ] });
    const response = await POST(new Request("http://localhost/api/transactions/tx-1/approve", {
      method: "POST", body: JSON.stringify({ paymentMethod: "TRANSFER", amountPaid: 50000 }),
    }), { params: Promise.resolve({ id: "tx-1" }) });

    expect(response.status).toBe(200);
    expect(paymentCreateManyMock).toHaveBeenCalledWith({ data: [
      { transactionId: "tx-1", method: "CASH", amount: 20000 },
      { transactionId: "tx-1", method: "TRANSFER", amount: 30000 },
    ] });
  });

  it("commits the final initial-payment ledger when approval changes the tender", async () => {
    afterMock.mockImplementation(() => undefined);
    const response = await POST(new Request("http://localhost/api/transactions/tx-1/approve", { method: "POST", body: JSON.stringify({ paymentMethod: "CASH", amountPaid: 60000 }) }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(200);
    expect(paymentDeleteManyMock).toHaveBeenCalledWith({ where: { transactionId: "tx-1" } });
    expect(paymentCreateManyMock).toHaveBeenCalledWith({ data: [{ transactionId: "tx-1", method: "CASH", amount: 60000 }] });
  });

  it("journals product and service-material deductions before returning even if after never runs", async () => {
    afterMock.mockImplementation(() => undefined);
    const current = await transactionFindFirstMock();
    transactionFindFirstMock.mockResolvedValue({
      ...current,
      stockDeductionSource: "SURAT_JALAN",
      items: [
        { productId: "product-1", productName: "Kertas", quantity: 2, unitCost: 1000 },
        { productId: null, printingServiceId: "service-1", productName: "Cetak", quantity: 1,
          rawMaterialProductId: "paper-1", rawMaterialQuantity: 3, unitCost: 2000 },
      ],
    });
    const response = await POST(new Request("http://localhost/api/transactions/tx-1/approve", {
      method: "POST", body: JSON.stringify({}),
    }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(200);
    expect(inventoryLogCreateManyMock).toHaveBeenCalledTimes(1);
    expect(inventoryLogCreateManyMock).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ productId: "product-1", transactionId: "tx-1", stockBaseDelta: -2 }),
      expect.objectContaining({ productId: "paper-1", transactionId: "tx-1", stockBaseDelta: -3 }),
    ]) });
    expect(transactionUpdateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ stockDeductionSource: "TRANSACTION" }),
    }));
    expect(customerUpdateMock).toHaveBeenCalledTimes(1);
    expect(customerUpdateMock.mock.invocationCallOrder[0]).toBeLessThan(transactionUpdateManyMock.mock.invocationCallOrder[0]);
  });

  it("persists quoted item discounts and net subtotal when approving edited lines", async () => {
    const quotedItem = {
      input: { sourceItemId: "saved-1", productId: "product-1", quantity: 2 },
      name: "Kertas", unit: "pcs", modal: null, unitCost: null,
      rawMaterialUnitCost: null, rawMaterialUnit: null,
      regular: 25000, agent: null, government: null, special: null,
      appliedUnitPrice: 25000, discount: 5000, subtotal: 45000, appliedPricing: null,
    };
    buildApprovalQuoteMock.mockResolvedValue({ items: [quotedItem], subtotal: 45000, discount: 0, tax: 0, total: 45000, fingerprint: "fresh-quote" });
    transactionUpdateMock.mockResolvedValue({ id: "tx-1", total: 45000, subtotal: 45000, items: [{ discount: 5000, subtotal: 45000 }] });
    const response = await POST(new Request("http://localhost/api/transactions/tx-1/approve", {
      method: "POST", body: JSON.stringify({ items: [quotedItem.input], quoteFingerprint: "fresh-quote", amountPaid: 45000 }),
    }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(200);
    expect(transactionUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ items: { deleteMany: {}, create: [expect.objectContaining({ unitPrice: 25000, discount: 5000, subtotal: 45000 })] } }),
    }));
  });

  it("returns a validation response when a saved discounted source is ambiguous", async () => {
    buildApprovalQuoteMock.mockRejectedValue(new Error("APPROVAL_SOURCE_ITEM_REQUIRED"));
    const response = await POST(new Request("http://localhost/api/transactions/tx-1/approve", {
      method: "POST", body: JSON.stringify({ items: [{ productId: "product-1", quantity: 1 }], quoteFingerprint: "fresh-quote" }),
    }), { params: Promise.resolve({ id: "tx-1" }) });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ message: "Muat ulang rincian transaksi agar diskon setiap barang tetap sesuai." });
    expect(transactionUpdateManyMock).not.toHaveBeenCalled();
  });

  it("rejects a changed approval quote before changing status or stock", async () => {
    buildApprovalQuoteMock.mockResolvedValue({
      items: [],
      subtotal: 50000,
      discount: 0,
      tax: 0,
      total: 50000,
      fingerprint: "fresh-quote",
    });

    const response = await POST(
      new Request("http://localhost/api/transactions/tx-1/approve", {
        method: "POST",
        body: JSON.stringify({
          items: [{ productId: "product-1", quantity: 2 }],
          quoteFingerprint: "stale-quote",
          paymentMethod: "CASH",
          amountPaid: 50000,
        }),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "APPROVAL_QUOTE_CHANGED",
      quote: { fingerprint: "fresh-quote" },
    });
    expect(transactionUpdateManyMock).not.toHaveBeenCalled();
    expect(productUpdateManyMock).not.toHaveBeenCalled();
  });

  it("preserves stored overpayment and change when approving", async () => {
    transactionFindFirstMock.mockResolvedValueOnce({
      id: "tx-1",
      invoiceNumber: "INV-20260520-0001",
      storeId: "store-main",
      status: "PENDING_APPROVAL",
      total: 50000,
      paymentMethod: "CASH",
      amountPaid: 60000,
      change: 10000,
      customerId: "customer-1",
      items: [{ productId: "product-1", quantity: 1 }],
    });
    queryRawMock.mockResolvedValueOnce([{ id: "product-1" }]);

    const response = await POST(
      new Request("http://localhost/api/transactions/tx-1/approve", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    expect(transactionUpdateManyMock).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "tx-1", storeId: "store-main", status: "PENDING_APPROVAL", total: 50000 }),
      data: expect.objectContaining({
        status: "COMPLETED",
        amountPaid: 60000,
        change: 10000,
      }),
    });
  });

  it("keeps Tempo distinct from DP and accepts zero paid for a linked customer", async () => {
    const response = await POST(
      new Request("http://localhost/api/transactions/tx-1/approve", {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "TEMPO", amountPaid: 0 }),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    expect(transactionUpdateManyMock).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "tx-1", storeId: "store-main", status: "PENDING_APPROVAL", total: 50000 }),
      data: expect.objectContaining({
        status: "COMPLETED",
        paymentMethod: "TEMPO",
        amountPaid: 0,
      }),
    });
  });

  it("requires a customer for Tempo approval", async () => {
    transactionFindFirstMock.mockResolvedValueOnce({
      id: "tx-1",
      invoiceNumber: "INV-20260520-0001",
      storeId: "store-main",
      status: "PENDING_APPROVAL",
      total: 50000,
      paymentMethod: "CASH",
      amountPaid: 0,
      customerId: null,
      items: [{ productId: "product-1", quantity: 1 }],
    });

    const response = await POST(
      new Request("http://localhost/api/transactions/tx-1/approve", {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "TEMPO", amountPaid: 0 }),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(422);
    expect(transactionUpdateManyMock).not.toHaveBeenCalled();
  });

  it("preserves a partial initial collection on Tempo approval", async () => {
    const response = await POST(
      new Request("http://localhost/api/transactions/tx-1/approve", {
        method: "POST",
        body: JSON.stringify({ paymentMethod: "TEMPO", amountPaid: 12500 }),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    expect(transactionUpdateManyMock).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "tx-1", storeId: "store-main", status: "PENDING_APPROVAL", total: 50000 }),
      data: expect.objectContaining({
        status: "COMPLETED",
        paymentMethod: "TEMPO",
        amountPaid: 12500,
      }),
    });
  });

  it("approves a sales-created regular invoice while preserving its invoice status", async () => {
    transactionFindFirstMock.mockResolvedValueOnce({
      id: "tx-1",
      invoiceNumber: "INV-20260520-0001",
      storeId: "store-main",
      status: "COMPLETED",
      cashierId: null,
      requestedById: "sales-1",
      total: 50000,
      paymentMethod: "TRANSFER",
      amountPaid: 50000,
      change: 0,
      customerId: "customer-1",
      items: [{ productId: "product-1", quantity: 1 }],
    });
    queryRawMock.mockResolvedValueOnce([{ id: "product-1" }]);

    const response = await POST(
      new Request("http://localhost/api/transactions/tx-1/approve", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    expect(transactionUpdateManyMock).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "tx-1",
        storeId: "store-main",
        requestedById: { not: null },
        cashierId: null,
        total: 50000,
      }),
      data: expect.objectContaining({
        status: "COMPLETED",
        cashierId: "cashier-1",
        amountPaid: 50000,
        change: 0,
      }),
    });
    expect(queryRawMock).toHaveBeenCalledTimes(1);
  });

  it("lets OWNER change invoice date during approval and regenerates the invoice number", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      role: "OWNER",
      name: "Owner One",
      storeId: "store-main",
    });
    transactionFindFirstMock.mockResolvedValueOnce({
      id: "tx-1",
      invoiceNumber: "INV-20260520-0007",
      invoiceDate: new Date("2026-05-20T03:00:00.000Z"),
      storeId: "store-main",
      status: "PENDING_APPROVAL",
      total: 50000,
      paymentMethod: "TRANSFER",
      amountPaid: 50000,
      change: 0,
      customerId: "customer-1",
      items: [{ productId: "product-1", quantity: 1 }],
    });
    transactionFindManyMock.mockResolvedValueOnce([
      { invoiceNumber: "INV-20260702-0001" },
      { invoiceNumber: "INV-20260702-0002" },
    ]);
    queryRawMock.mockResolvedValueOnce([{ id: "product-1" }]);

    const response = await POST(
      new Request("http://localhost/api/transactions/tx-1/approve", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "CASH",
          amountPaid: 50000,
          invoiceDate: "2026-07-02",
          invoiceTime: "16:30",
          invoiceDateReason: "Final invoice dicetak ulang saat approval",
        }),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invoiceNumber).toBe("INV-20260702-0007");
    expect(body.invoiceDate).toBe("2026-07-02T09:30:00.000Z");
    expect(transactionFindManyMock).toHaveBeenCalledWith({
      where: {
        storeId: "store-main",
        invoiceNumber: { startsWith: "INV-20260702-" },
        id: { not: "tx-1" },
      },
      select: { invoiceNumber: true },
    });
    expect(transactionUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceDate: new Date("2026-07-02T09:30:00.000Z"),
          invoiceNumber: "INV-20260702-0007",
        }),
      }),
    );
  });
});
