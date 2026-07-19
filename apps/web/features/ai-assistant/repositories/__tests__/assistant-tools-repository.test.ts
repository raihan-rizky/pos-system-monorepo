import { beforeEach, describe, expect, it, vi } from "vitest";

const productFindManyMock = vi.hoisted(() => vi.fn());
const productFindFirstMock = vi.hoisted(() => vi.fn());
const customerFindManyMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const debtPaymentLogFindManyMock = vi.hoisted(() => vi.fn());
const cashierShiftFindManyMock = vi.hoisted(() => vi.fn());
const inventoryLogFindManyMock = vi.hoisted(() => vi.fn());
const expenseAggregateMock = vi.hoisted(() => vi.fn());
const expenseCountMock = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", () => ({
  db: {
    product: { findMany: productFindManyMock, findFirst: productFindFirstMock },
    customer: { findMany: customerFindManyMock },
    transaction: { findMany: transactionFindManyMock },
    debtPaymentLog: { findMany: debtPaymentLogFindManyMock },
    cashierShift: { findMany: cashierShiftFindManyMock },
    inventoryLog: { findMany: inventoryLogFindManyMock },
    expense: { aggregate: expenseAggregateMock, count: expenseCountMock },
  },
}));

import {
  getCustomerDebtSummary,
  getCustomerRecapSummary,
  getCustomerSearch,
  getDailySalesSummary,
  getFinancialReportAnalysis,
  getLowStockItems,
  getProductPrice,
  getProductSearch,
  getProductStock,
  getSystemHelp,
} from "../assistant-tools-repository";

describe("assistant tools repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active low-stock products scoped to store with safe fields", async () => {
    productFindManyMock.mockResolvedValue([
      { id: "p1", name: "Kertas A4", sku: "A4", stock: 2, minStock: 5, unit: "rim" },
    ]);

    const result = await getLowStockItems({ storeId: "store-1", limit: 50 });

    expect(productFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store-1", isActive: true }),
      select: { id: true, name: true, sku: true, stock: true, minStock: true, unit: true },
      take: 200,
    }));
    expect(result.items).toEqual([
      { id: "p1", name: "Kertas A4", sku: "A4", stock: 2, minStock: 5, unit: "rim" },
    ]);
    expect(result.generatedAt).toBeDefined();
  });

  it("filters out products above minimum stock and limits final result", async () => {
    productFindManyMock.mockResolvedValue([
      { id: "p1", name: "Low", sku: "LOW", stock: 1, minStock: 5, unit: "pcs" },
      { id: "p2", name: "Healthy", sku: "OK", stock: 10, minStock: 5, unit: "pcs" },
    ]);

    const result = await getLowStockItems({ storeId: "store-1", limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Low");
  });

  it("summarizes completed daily sales scoped to store", async () => {
    transactionFindManyMock.mockResolvedValue([
      { total: { toNumber: () => 100000 }, items: [{ subtotal: { toNumber: () => 100000 }, unitCost: { toNumber: () => 40000 }, quantity: 1 }] },
      { total: { toNumber: () => 50000 }, items: [{ subtotal: { toNumber: () => 50000 }, unitCost: null, quantity: 1 }] },
    ]);

    const result = await getDailySalesSummary({ storeId: "store-1", date: "2026-06-26" });

    expect(transactionFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store-1", status: "COMPLETED" }),
    }));
    expect(result.transactionCount).toBe(2);
    expect(result.revenue).toBe(150000);
    expect(result.grossProfit).toBe(60000);
  });

  it("returns markdown help docs with source refs", async () => {
    const result = await getSystemHelp({ query: "cara tambah produk" });

    expect(result.markdown).toContain("produk");
    expect(result.source).toBe("markdown-help-docs");
    expect(result.sourceRefs).toContain("products.md");
  });

  it("returns help overview when query has no doc match", async () => {
    const result = await getSystemHelp({ query: "xyz unknown" });

    expect(result.markdown).toContain("Topik bantuan");
    expect(result.sourceRefs.length).toBeGreaterThan(1);
  });

  it("searches active products scoped to store", async () => {
    productFindManyMock.mockResolvedValue([
      { id: "p1", name: "Kertas A4", sku: "A4", stock: 10, minStock: 5, unit: "rim", price: { toNumber: () => 50000 }, category: { name: "ATK" } },
    ]);

    const result = await getProductSearch({ storeId: "store-1", query: "A4", limit: 10 });

    expect(productFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store-1", isActive: true }),
      take: 10,
    }));
    expect(result.items[0]).toMatchObject({ name: "Kertas A4", price: 50000, category: "ATK" });
  });

  it("returns product stock using safe fields", async () => {
    productFindManyMock.mockResolvedValue([
      { id: "p1", name: "Kertas A4", sku: "A4", stock: 10, minStock: 5, unit: "rim", price: { toNumber: () => 50000 }, category: { name: "ATK" } },
    ]);

    const result = await getProductStock({ storeId: "store-1", query: "A4" });

    expect(result.match).toMatchObject({ name: "Kertas A4", stock: 10, minStock: 5, unit: "rim" });
  });

  it("returns product price using safe fields", async () => {
    productFindManyMock.mockResolvedValue([
      { id: "p1", name: "Kertas A4", sku: "A4", stock: 10, minStock: 5, unit: "rim", price: { toNumber: () => 50000 }, category: { name: "ATK" } },
    ]);

    const result = await getProductPrice({ storeId: "store-1", query: "A4" });

    expect(result.match).toMatchObject({ name: "Kertas A4", price: 50000 });
  });

  it("searches customers scoped to store", async () => {
    customerFindManyMock.mockResolvedValue([
      { id: "c1", name: "Budi", phone: "0812", company: "Budi Co", type: "UMUM", totalDebt: { toNumber: () => 100000 }, totalSpent: { toNumber: () => 500000 }, totalOrders: 5, lastVisitAt: new Date("2026-06-01") },
    ]);

    const result = await getCustomerSearch({ storeId: "store-1", query: "Budi", limit: 10 });

    expect(customerFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store-1" }),
      take: 10,
    }));
    expect(result.items[0]).toMatchObject({ name: "Budi", totalDebt: 100000 });
  });

  it("returns customer debt summary for unique customer match", async () => {
    customerFindManyMock.mockResolvedValue([
      { id: "c1", name: "Budi", phone: "0812", company: null, type: "UMUM", totalDebt: { toNumber: () => 100000 }, totalSpent: { toNumber: () => 500000 }, totalOrders: 5, lastVisitAt: null },
    ]);

    const result = await getCustomerDebtSummary({ storeId: "store-1", query: "Budi" });

    expect(result.match).toMatchObject({ name: "Budi", totalDebt: 100000 });
  });

  it("returns customer recap summary for last 30 days", async () => {
    customerFindManyMock.mockResolvedValueOnce([
      { id: "c1", name: "Budi", phone: "0812", company: null, type: "UMUM", totalDebt: { toNumber: () => 100000 }, totalSpent: { toNumber: () => 500000 }, totalOrders: 5, lastVisitAt: null },
    ]);
    transactionFindManyMock.mockResolvedValue([{ id: "t1", total: { toNumber: () => 75000 }, createdAt: new Date("2026-06-20"), status: "COMPLETED" }]);
    debtPaymentLogFindManyMock.mockResolvedValue([{ amount: { toNumber: () => 25000 }, createdAt: new Date("2026-06-21") }]);

    const result = await getCustomerRecapSummary({ storeId: "store-1", query: "Budi", now: new Date("2026-06-26T10:00:00Z") });

    expect(transactionFindManyMock).toHaveBeenCalled();
    expect(result.match).toMatchObject({ name: "Budi", transactionCount: 1, revenue: 75000, debtPaid: 25000 });
  });

  it("loads every financial-report section for a holistic analysis", async () => {
    transactionFindManyMock.mockResolvedValueOnce([{
      id: "tx-1",
      invoiceNumber: "INV-1",
      invoiceDate: new Date("2026-06-20T02:00:00.000Z"),
      createdAt: new Date("2026-06-20T02:00:00.000Z"),
      status: "COMPLETED",
      paymentMethod: "CASH",
      total: { toNumber: () => 100_000 },
      amountPaid: { toNumber: () => 100_000 },
      discount: { toNumber: () => 5_000 },
      salesName: "Ari",
      salesperson: null,
      items: [{
        productId: "p1",
        productName: "Kertas",
        quantity: 2,
        subtotal: { toNumber: () => 100_000 },
        unitCost: { toNumber: () => 30_000 },
        product: { category: { name: "ATK" } },
      }],
    }]);
    cashierShiftFindManyMock.mockResolvedValueOnce([{
      id: "shift-1",
      cashier: { name: "Rina" },
      openedAt: new Date("2026-06-20T00:00:00.000Z"),
      closedAt: new Date("2026-06-20T08:00:00.000Z"),
      openingBalance: 50_000,
      expectedBalance: 150_000,
      closingBalance: 145_000,
      discrepancy: -5_000,
      status: "CLOSED",
    }]);
    inventoryLogFindManyMock.mockResolvedValueOnce([{
      type: "OUT",
      reason: "WASTE",
      quantity: 1,
      unitCost: 10_000,
      createdAt: new Date("2026-06-20T03:00:00.000Z"),
    }]);
    expenseAggregateMock.mockResolvedValueOnce({
      _sum: { amount: 45_000, changeAmount: 5_000 },
      _count: { _all: 2 },
    });
    expenseCountMock.mockResolvedValueOnce(1);

    const result = await getFinancialReportAnalysis({
      storeId: "store-1",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
    });

    expect(transactionFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: "store-1", invoiceDate: expect.any(Object) }),
    }));
    expect(expenseAggregateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: "store-1",
        deletedAt: null,
        occurredAt: expect.any(Object),
      }),
    }));
    expect(expenseCountMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: "store-1",
        hasMissingCostSnapshot: true,
      }),
    }));
    expect(result.summary).toMatchObject({
      revenue: 100_000,
      collected: 100_000,
      grossProfit: 30_000,
      lossStokNet: 10_000,
      shiftDiscrepancy: -5_000,
      expenseTotal: 40_000,
      expenseEntryCount: 2,
      incompleteExpenseCount: 1,
      estimatedNetProfit: -10_000,
    });
    expect(result).toMatchObject({
      paymentMethods: [expect.objectContaining({ method: "CASH" })],
      topProducts: [expect.objectContaining({ productName: "Kertas" })],
      categories: [expect.objectContaining({ categoryName: "ATK" })],
      salespersons: [expect.objectContaining({ name: "Ari" })],
      lossStok: [expect.objectContaining({ reason: "WASTE" })],
      shifts: [expect.objectContaining({ cashierName: "Rina" })],
      trend: expect.objectContaining({ points: expect.any(Array) }),
    });
  });
});
