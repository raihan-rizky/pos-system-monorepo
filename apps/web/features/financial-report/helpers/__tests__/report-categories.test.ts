import { describe, expect, it } from "vitest";
import { buildFinancialReport, type FinancialReportTransaction } from "../report-core";

const tx = (extra = {}) => ({ id: "t1", invoiceNumber: "INV-1", createdAt: new Date("2026-11-05T03:00:00Z"), status: "COMPLETED", paymentMethod: "CASH", total: 90, amountPaid: 90, discount: 10,
  items: [{ productName: "Buku", quantity: 1, subtotal: 60, unitCost: 20, product: { category: { name: "Buku" } } }, { productName: "Pulpen", quantity: 1, subtotal: 40, unitCost: 10, product: { category: { name: "Alat Tulis" } } }], ...extra });
describe("full report main categories and subcategories", () => {
  it("groups only ATK/Percetakan and keeps product/printing detail in subcategories", () => {
    const report = buildFinancialReport({ dateFrom: "2026-11-05", dateTo: "2026-11-05", transactions: [tx(), tx({ id: "t2", transactionCategory: "PERCETAKAN", printingSubcategory: "PLAT", total: 100, amountPaid: 30, items: [] })] as FinancialReportTransaction[], shifts: [] });
    expect(report.categories.map(row => row.categoryName)).toEqual(["ATK", "Percetakan"]);
    expect(report.categories.map(row => row.revenue)).toEqual([100, 100]);
    expect(report.subcategories).toEqual(expect.arrayContaining([
      expect.objectContaining({ categoryName: "ATK", subcategoryName: "Buku", revenue: 60 }),
      expect.objectContaining({ categoryName: "ATK", subcategoryName: "Alat Tulis", revenue: 40 }),
      expect.objectContaining({ categoryName: "Percetakan", subcategoryName: "Plat", revenue: 100 }),
    ]));
    expect(report.summary.revenue).toBe(190);
    expect(report.subcategories.find(row => row.subcategoryName === "Buku")?.grossProfit).toBe(40);
    expect(report.subcategories.find(row => row.subcategoryName === "Alat Tulis")?.grossProfit).toBe(30);
  });
  it("recognizes printing service rows in legacy invoices", () => {
    const report = buildFinancialReport({ dateFrom: "2026-11-05", dateTo: "2026-11-05", transactions: [tx({ items: [{ productName: "Jasa", printingServiceId: "service-1", subtotal: 100, quantity: 1, unitCost: 10 }] })] as FinancialReportTransaction[], shifts: [] });
    expect(report.categories[0].categoryName).toBe("Percetakan");
    expect(report.subcategories[0].subcategoryName).toBe("Belum ditentukan");
  });
});
