import { describe, expect, it } from "vitest";
import {
  buildReportRows,
  buildReportFooter,
  buildReportCategorySummary,
  buildReportPeriodRange,
  buildReportSheetData,
  type ReportSaleInput,
  type ReportExpenseInput,
} from "../journal-core";

describe("buildReportPeriodRange (Asia/Jakarta)", () => {
  it("returns today's range for 'daily'", () => {
    const now = new Date("2026-05-20T10:30:00.000Z");
    const range = buildReportPeriodRange("daily", now);
    expect(range).toEqual({ from: "2026-05-20", to: "2026-05-20" });
  });

  it("returns last 7 days inclusive for 'weekly'", () => {
    const now = new Date("2026-05-20T10:30:00.000Z");
    const range = buildReportPeriodRange("weekly", now);
    expect(range).toEqual({ from: "2026-05-14", to: "2026-05-20" });
  });

  it("returns first-of-month to today for 'monthly'", () => {
    const now = new Date("2026-05-20T10:30:00.000Z");
    const range = buildReportPeriodRange("monthly", now);
    expect(range).toEqual({ from: "2026-05-01", to: "2026-05-20" });
  });
});

describe("buildReportRows", () => {
  const sale: ReportSaleInput = {
    id: "tx1",
    invoiceNumber: "INV-001",
    createdAt: new Date("2026-05-20T01:00:00.000Z"), // 08:00 WIB
    salesName: "Ari",
    salesperson: null,
    customerName: null,
    paymentMethod: "CASH",
    total: 250_000,
    items: [
      {
        productName: "Banner",
        subtotal: 150_000,
        product: { category: { name: "Cetak" } },
      },
      {
        productName: "Tinta",
        subtotal: 100_000,
        product: { category: { name: "ATK" } },
      },
    ],
  };

  const expense: ReportExpenseInput = {
    id: "exp123",
    occurredAt: new Date("2026-05-20T02:00:00.000Z"),
    applicantName: "Pak Budi",
    category: "SUPPLIES",
    description: "Kertas A4",
    amount: 100_000,
    changeAmount: 12_500,
  };

  it("converts a sale into one report row with comma-separated products and categories", () => {
    const rows = buildReportRows([sale], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tanggal: "2026-05-20",
      invoice: "INV-001",
      person: "Ari",
      products: "Banner, Tinta",
      categories: "Cetak, ATK",
      status: "Pemasukan",
      amount: 250_000,
      method: "CASH",
    });
  });

  it("dedupes categories on a sale row", () => {
    const sameCategorySale: ReportSaleInput = {
      ...sale,
      items: [
        { productName: "A", product: { category: { name: "Cetak" } } },
        { productName: "B", product: { category: { name: "Cetak" } } },
      ],
    };
    const rows = buildReportRows([sameCategorySale], []);
    expect(rows[0]?.categories).toBe("Cetak");
  });

  it("falls back person name from salesName -> salesperson.name -> customerName", () => {
    expect(buildReportRows([{ ...sale, salesName: null }], [])[0]?.person).toBe("");
    expect(
      buildReportRows(
        [{ ...sale, salesName: null, salesperson: { name: "Rina" } }],
        [],
      )[0]?.person,
    ).toBe("Rina");
    expect(
      buildReportRows(
        [
          {
            ...sale,
            salesName: null,
            salesperson: null,
            customerName: "Toko XYZ",
          },
        ],
        [],
      )[0]?.person,
    ).toBe("Toko XYZ");
  });

  it("converts an expense into a row with EXP- invoice, negative net amount, blank method", () => {
    const rows = buildReportRows([], [expense]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tanggal: "2026-05-20",
      invoice: "EXP-exp123",
      person: "Pak Budi",
      products: "Kertas A4",
      categories: "Perlengkapan",
      status: "Pengeluaran",
      amount: -87_500, // -(100000 - 12500)
      method: "",
    });
  });

  it("uses category label for products column when description is empty", () => {
    const rows = buildReportRows([], [{ ...expense, description: null }]);
    expect(rows[0]?.products).toBe("Perlengkapan");
  });

  it("sorts by date asc, sales before expenses on the same day", () => {
    const day1Sale = { ...sale, createdAt: new Date("2026-05-19T10:00:00.000Z") };
    const day2Sale = { ...sale, createdAt: new Date("2026-05-20T10:00:00.000Z") };
    const day2Exp = { ...expense, occurredAt: new Date("2026-05-20T03:00:00.000Z") };
    const day2ExpEarly = {
      ...expense,
      occurredAt: new Date("2026-05-20T01:00:00.000Z"),
    };
    const rows = buildReportRows([day2Sale, day1Sale], [day2Exp, day2ExpEarly]);
    expect(rows.map((r) => `${r.tanggal}|${r.status}`)).toEqual([
      "2026-05-19|Pemasukan",
      "2026-05-20|Pemasukan",
      "2026-05-20|Pengeluaran",
      "2026-05-20|Pengeluaran",
    ]);
  });
});

describe("buildReportFooter", () => {
  const rows = [
    {
      tanggal: "2026-05-20",
      invoice: "INV-1",
      person: "Ari",
      products: "X",
      categories: "C",
      status: "Pemasukan" as const,
      amount: 100_000,
      method: "CASH",
    },
    {
      tanggal: "2026-05-20",
      invoice: "INV-2",
      person: "Rina",
      products: "Y",
      categories: "C",
      status: "Pemasukan" as const,
      amount: 200_000,
      method: "TRANSFER",
    },
    {
      tanggal: "2026-05-20",
      invoice: "INV-3",
      person: "Eka",
      products: "Z",
      categories: "C",
      status: "Pemasukan" as const,
      amount: 50_000,
      method: "CASH",
    },
    {
      tanggal: "2026-05-20",
      invoice: "EXP-a",
      person: "Budi",
      products: "Kertas",
      categories: "Supplies",
      status: "Pengeluaran" as const,
      amount: -30_000,
      method: "",
    },
  ];

  it("computes 3-tier totals (pemasukan, pengeluaran, grand)", () => {
    const f = buildReportFooter(rows);
    expect(f.totalPemasukan).toBe(350_000);
    expect(f.totalPengeluaran).toBe(-30_000);
    expect(f.grandTotal).toBe(320_000);
  });

  it("breaks down income by all 5 fixed payment methods, missing methods default to 0", () => {
    const f = buildReportFooter(rows);
    expect(f.byMethod).toEqual({
      CASH: 150_000,
      TRANSFER: 200_000,
      QRIS: 0,
      DEBIT: 0,
      CREDIT: 0,
    });
  });

  it("excludes expense rows from per-method breakdown", () => {
    const onlyExpense = [
      {
        tanggal: "2026-05-20",
        invoice: "EXP-1",
        person: "B",
        products: "x",
        categories: "y",
        status: "Pengeluaran" as const,
        amount: -50_000,
        method: "",
      },
    ];
    const f = buildReportFooter(onlyExpense);
    expect(f.byMethod).toEqual({
      CASH: 0,
      TRANSFER: 0,
      QRIS: 0,
      DEBIT: 0,
      CREDIT: 0,
    });
    expect(f.totalPengeluaran).toBe(-50_000);
  });

  it("returns zeros for empty rows", () => {
    const f = buildReportFooter([]);
    expect(f.totalPemasukan).toBe(0);
    expect(f.totalPengeluaran).toBe(0);
    expect(f.grandTotal).toBe(0);
  });
});

describe("buildReportCategorySummary", () => {
  it("summarizes revenue from existing product categories by item subtotal", () => {
    const rows = buildReportCategorySummary([
      {
        id: "tx1",
        invoiceNumber: "INV-001",
        createdAt: new Date("2026-05-20T01:00:00.000Z"),
        salesName: "Ari",
        salesperson: null,
        customerName: null,
        paymentMethod: "CASH",
        total: 250_000,
        items: [
          {
            productName: "Banner",
            subtotal: 150_000,
            product: { category: { name: "Cetak" } },
          },
          {
            productName: "Tinta",
            subtotal: 100_000,
            product: { category: { name: "ATK" } },
          },
        ],
      },
      {
        id: "tx2",
        invoiceNumber: "INV-002",
        createdAt: new Date("2026-05-20T02:00:00.000Z"),
        salesName: "Rina",
        salesperson: null,
        customerName: null,
        paymentMethod: "QRIS",
        total: 50_000,
        items: [
          {
            productName: "Sticker",
            subtotal: 50_000,
            product: { category: { name: "Cetak" } },
          },
        ],
      },
    ]);

    expect(rows).toEqual([
      { categoryName: "Cetak", transactionCount: 2, revenue: 200_000 },
      { categoryName: "ATK", transactionCount: 1, revenue: 100_000 },
    ]);
  });

  it("falls back missing product category to Tanpa kategori", () => {
    const rows = buildReportCategorySummary([
      {
        id: "tx1",
        invoiceNumber: "INV-001",
        createdAt: new Date("2026-05-20T01:00:00.000Z"),
        salesName: "Ari",
        salesperson: null,
        customerName: null,
        paymentMethod: "CASH",
        total: 25_000,
        items: [{ productName: "Custom", subtotal: 25_000, product: null }],
      },
    ]);

    expect(rows).toEqual([
      { categoryName: "Tanpa kategori", transactionCount: 1, revenue: 25_000 },
    ]);
  });
});

describe("buildReportSheetData", () => {
  it("emits header, data rows, blank row, and footer rows in order", () => {
    const rows = [
      {
        tanggal: "2026-05-20",
        invoice: "INV-1",
        person: "Ari",
        products: "X",
        categories: "C",
        status: "Pemasukan" as const,
        amount: 100_000,
        method: "CASH",
      },
    ];
    const footer = buildReportFooter(rows);
    const sheet = buildReportSheetData(rows, footer);

    // header
    expect(sheet[0]).toEqual([
      "Tanggal",
      "No. Invoice",
      "Pemohon/Sales",
      "Produk",
      "Kategori",
      "Status",
      "Jumlah",
      "Metode",
    ]);
    // data
    expect(sheet[1]).toEqual([
      "2026-05-20",
      "INV-1",
      "Ari",
      "X",
      "C",
      "Pemasukan",
      100_000,
      "CASH",
    ]);
    // blank separator
    expect(sheet[2]).toEqual([]);
    // footer rows
    const footerRowLabels = sheet.slice(3).map((r) => r[0]);
    expect(footerRowLabels).toEqual([
      "Total Pemasukan",
      "Total Pengeluaran",
      "Grand Total",
      "",
      "CASH",
      "TRANSFER",
      "QRIS",
      "DEBIT",
      "CREDIT",
    ]);
  });

  it("places numeric totals in the Jumlah column (index 6)", () => {
    const rows = [
      {
        tanggal: "2026-05-20",
        invoice: "INV-1",
        person: "Ari",
        products: "X",
        categories: "C",
        status: "Pemasukan" as const,
        amount: 100_000,
        method: "CASH",
      },
    ];
    const footer = buildReportFooter(rows);
    const sheet = buildReportSheetData(rows, footer);

    const totalPemasukanRow = sheet.find((r) => r[0] === "Total Pemasukan");
    expect(totalPemasukanRow?.[6]).toBe(100_000);

    const cashRow = sheet.find((r) => r[0] === "CASH" && r !== sheet[1]);
    expect(cashRow?.[6]).toBe(100_000);
  });

  it("includes revenue per product category in the main Excel sheet data", () => {
    const rows = [
      {
        tanggal: "2026-05-20",
        invoice: "INV-1",
        person: "Ari",
        products: "Banner",
        categories: "Cetak",
        status: "Pemasukan" as const,
        amount: 150_000,
        method: "CASH",
      },
    ];
    const footer = buildReportFooter(rows);
    const sheet = buildReportSheetData(rows, footer, [
      { categoryName: "Cetak", transactionCount: 1, revenue: 150_000 },
    ]);

    expect(sheet).toContainEqual([
      "Revenue per Kategori Produk",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    expect(sheet).toContainEqual([
      "Kategori Produk",
      "Transaksi",
      "",
      "",
      "",
      "",
      "Revenue",
      "",
    ]);
    expect(sheet).toContainEqual([
      "Cetak",
      1,
      "",
      "",
      "",
      "",
      150_000,
      "",
    ]);
  });
});
