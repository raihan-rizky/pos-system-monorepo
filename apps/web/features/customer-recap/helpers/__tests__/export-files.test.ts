import { describe, expect, it, vi } from "vitest";
import { exportCustomerRecapXlsx } from "../export-files";
import type { CustomerRecapExportData } from "../export-core";

const writeFileMock = vi.hoisted(() => vi.fn());

vi.mock("xlsx-js-style", async () => {
  const importedModule = await vi.importActual<any>("xlsx-js-style");
  const actual = importedModule.default ?? importedModule;
  return { ...importedModule, ...actual, default: actual, writeFile: writeFileMock };
});

const exportData: CustomerRecapExportData = {
  dateFrom: "2026-05-01",
  dateTo: "2026-05-31",
  summary: {
    newCustomers: 1,
    returningCustomers: 2,
    churnedCustomers: 0,
    totalDebtOutstanding: 100_000,
    debtCollectedInPeriod: 50_000,
    avgOrderValue: 125_000,
    orderFrequency: 1,
    repeatPurchaseRate: 0.5,
  },
  typeSummaries: [
    {
      type: "AGEN",
      customerCount: 1,
      transactionCount: 1,
      totalSpent: 125_000,
      averageOrderValue: 125_000,
      debtOutstanding: 100_000,
    },
    { type: "UMUM", customerCount: 0, transactionCount: 0, totalSpent: 0, averageOrderValue: 0, debtOutstanding: 0 },
    { type: "PEMERINTAH", customerCount: 0, transactionCount: 0, totalSpent: 0, averageOrderValue: 0, debtOutstanding: 0 },
    { type: "INDUSTRI", customerCount: 0, transactionCount: 0, totalSpent: 0, averageOrderValue: 0, debtOutstanding: 0 },
  ],
  groups: [
    {
      type: "AGEN",
      customers: [
        {
          id: "customer-1",
          name: "Agen Satu",
          orderCount: 1,
          totalSpent: 125_000,
          averageOrderValue: 125_000,
          totalDebt: 100_000,
          lastVisitAt: null,
          favoriteProducts: "Produk A",
        },
      ],
      topProducts: [
        { productId: "product-1", productName: "Produk A", quantity: 2, subtotal: 125_000 },
      ],
      summary: {
        type: "AGEN",
        customerCount: 1,
        transactionCount: 1,
        totalSpent: 125_000,
        averageOrderValue: 125_000,
        debtOutstanding: 100_000,
      },
    },
    ...(["UMUM", "PEMERINTAH", "INDUSTRI"] as const).map((type) => ({
      type,
      customers: [],
      topProducts: [],
      summary: {
        type,
        customerCount: 0,
        transactionCount: 0,
        totalSpent: 0,
        averageOrderValue: 0,
        debtOutstanding: 0,
      },
    })),
  ],
};

describe("exportCustomerRecapXlsx", () => {
  it("writes the four type sheets followed by the summary sheet", async () => {
    await exportCustomerRecapXlsx(exportData, ["Fokus pada Produk A"]);

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [workbook, filename] = writeFileMock.mock.calls[0] as [
      { SheetNames: string[]; Sheets: Record<string, Record<string, { v: unknown }>> },
      string,
    ];
    expect(workbook.SheetNames).toEqual([
      "Agen",
      "Umum",
      "Pemerintah",
      "Industri",
      "Ringkasan",
    ]);
    expect(workbook.Sheets.Ringkasan.A1.v).toBe("Ringkasan Semua Tipe Pelanggan");
    expect(workbook.Sheets.Ringkasan.A21.v).toBe("Analisis AI");
    expect(filename).toBe("rekap-pelanggan-2026-05-01-2026-05-31.xlsx");
  });
});
