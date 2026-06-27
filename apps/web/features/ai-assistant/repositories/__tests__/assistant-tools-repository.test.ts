import { beforeEach, describe, expect, it, vi } from "vitest";

const productFindManyMock = vi.hoisted(() => vi.fn());
const productFindFirstMock = vi.hoisted(() => vi.fn());
const customerFindManyMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const debtPaymentLogFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", () => ({
  db: {
    product: { findMany: productFindManyMock, findFirst: productFindFirstMock },
    customer: { findMany: customerFindManyMock },
    transaction: { findMany: transactionFindManyMock },
    debtPaymentLog: { findMany: debtPaymentLogFindManyMock },
  },
}));

import {
  getCustomerDebtSummary,
  getCustomerRecapSummary,
  getCustomerSearch,
  getDailySalesSummary,
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
});
