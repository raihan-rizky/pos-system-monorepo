import { describe, expect, it } from "vitest";
import {
  buildFinancialReport,
  buildFinancialReportRange,
  bucketKeyForDate,
  pickGranularity,
} from "../report-core";

describe("buildFinancialReportRange", () => {
  it("builds Jakarta calendar day ranges for supported presets", () => {
    const now = new Date("2026-05-20T10:30:00.000Z");

    expect(buildFinancialReportRange("today", now)).toEqual({
      dateFrom: "2026-05-20",
      dateTo: "2026-05-20",
    });
    expect(buildFinancialReportRange("7d", now)).toEqual({
      dateFrom: "2026-05-14",
      dateTo: "2026-05-20",
    });
    expect(buildFinancialReportRange("month", now)).toEqual({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-20",
    });
    expect(buildFinancialReportRange("30d", now)).toEqual({
      dateFrom: "2026-04-21",
      dateTo: "2026-05-20",
    });
  });
});

describe("buildFinancialReport", () => {
  it("subtracts manual and shopping-request expenses from estimated net profit", () => {
    const input = {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      transactions: [
        {
          id: "tx-1",
          invoiceNumber: "INV-1",
          createdAt: new Date("2026-07-10T02:00:00.000Z"),
          status: "COMPLETED",
          paymentMethod: "CASH",
          total: 100000,
          amountPaid: 100000,
          discount: 0,
          salesName: null,
          salesperson: null,
          items: [
            {
              productId: "product-1",
              productName: "Produk",
              quantity: 1,
              subtotal: 100000,
              unitCost: 40000,
              product: null,
            },
          ],
        },
      ],
      shifts: [],
      inventoryLogs: [],
      expenses: [
        { amount: "25000.00", changeAmount: "5000.00", hasMissingCostSnapshot: false },
        { amount: "10000.00", changeAmount: "0.00", hasMissingCostSnapshot: true },
      ],
    };

    const report = buildFinancialReport(input);
    const summary = report.summary as typeof report.summary & {
      expenseTotal: number;
      expenseEntryCount: number;
      incompleteExpenseCount: number;
      estimatedNetProfit: number;
    };

    expect(summary.expenseTotal).toBe(30000);
    expect(summary.expenseEntryCount).toBe(2);
    expect(summary.incompleteExpenseCount).toBe(1);
    expect(summary.estimatedNetProfit).toBe(30000);
  });

  it("summarizes revenue, gross profit, collections, outstanding DP, and shifts", () => {
    const report = buildFinancialReport({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      transactions: [
        {
          id: "tx-cash",
          invoiceNumber: "INV-1",
          createdAt: new Date("2026-05-20T02:00:00.000Z"),
          status: "COMPLETED",
          paymentMethod: "CASH",
          total: 100000,
          amountPaid: 100000,
          discount: 5000,
          salesName: "Ari",
          salesperson: null,
          items: [
            {
              productId: "prod-a",
              productName: "Banner",
              quantity: 2,
              subtotal: 100000,
              unitCost: 30000,
              product: { category: { name: "Printing" } },
            },
          ],
        },
        {
          id: "tx-dp",
          invoiceNumber: "INV-2",
          createdAt: new Date("2026-05-20T03:00:00.000Z"),
          status: "DP",
          paymentMethod: "QRIS",
          total: 200000,
          amountPaid: 50000,
          discount: 0,
          salesName: null,
          salesperson: { name: "Budi" },
          items: [
            {
              productId: "prod-b",
              productName: "Sticker",
              quantity: 1,
              subtotal: 200000,
              unitCost: 120000,
              product: { category: { name: "Sticker" } },
            },
          ],
        },
        {
          id: "tx-pending",
          invoiceNumber: "INV-3",
          createdAt: new Date("2026-05-20T04:00:00.000Z"),
          status: "PENDING_APPROVAL",
          paymentMethod: "TRANSFER",
          total: 75000,
          amountPaid: 0,
          discount: 0,
          salesName: null,
          salesperson: null,
          items: [],
        },
        {
          id: "tx-void",
          invoiceNumber: "INV-4",
          createdAt: new Date("2026-05-20T05:00:00.000Z"),
          status: "VOIDED",
          paymentMethod: "CASH",
          total: 90000,
          amountPaid: 90000,
          discount: 0,
          salesName: null,
          salesperson: null,
          items: [],
        },
      ],
      shifts: [
        {
          id: "shift-1",
          cashier: { name: "Siti" },
          openedAt: new Date("2026-05-20T01:00:00.000Z"),
          closedAt: new Date("2026-05-20T09:00:00.000Z"),
          openingBalance: 100000,
          expectedBalance: 200000,
          closingBalance: 198000,
          discrepancy: -2000,
          status: "CLOSED",
        },
      ],
    });

    expect(report.summary).toMatchObject({
      transactionCount: 2,
      revenue: 300000,
      collected: 150000,
      grossProfit: 120000,
      grossMargin: 0.4,
      discount: 5000,
      outstandingDp: 150000,
      shiftDiscrepancy: -2000,
    });
    expect(report.paymentMethods).toEqual([
      { method: "CASH", transactionCount: 1, revenue: 100000, collected: 100000 },
      { method: "QRIS", transactionCount: 1, revenue: 200000, collected: 50000 },
    ]);
    expect(report.topProducts[0]).toMatchObject({
      productId: "prod-b",
      productName: "Sticker",
      quantity: 1,
      revenue: 200000,
      grossProfit: 80000,
    });
    expect(report.categories).toEqual([
      { categoryName: "Printing", transactionCount: 1, quantity: 2, revenue: 100000, grossProfit: 40000 },
      { categoryName: "Sticker", transactionCount: 1, quantity: 1, revenue: 200000, grossProfit: 80000 },
    ]);
    expect(report.salespersons).toEqual([
      { name: "Budi", transactionCount: 1, revenue: 200000, collected: 50000, grossProfit: 80000 },
      { name: "Ari", transactionCount: 1, revenue: 100000, collected: 100000, grossProfit: 40000 },
    ]);
    expect(report.shifts).toEqual([
      {
        id: "shift-1",
        cashierName: "Siti",
        openedAt: "2026-05-20T01:00:00.000Z",
        closedAt: "2026-05-20T09:00:00.000Z",
        openingBalance: 100000,
        expectedBalance: 200000,
        closingBalance: 198000,
        discrepancy: -2000,
        status: "CLOSED",
      },
    ]);
  });

  it("returns zero loss stok when inventoryLogs is empty", () => {
    const report = buildFinancialReport({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      transactions: [],
      shifts: [],
      inventoryLogs: [],
    });

    expect(report.summary.lossStokNet).toBe(0);
    expect(report.summary.lossStokUnclassifiedCount).toBe(0);
    expect(report.lossStok).toEqual([]);
  });

  it("buckets loss stok by reason and values each at unitCost × quantity", () => {
    const report = buildFinancialReport({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      transactions: [],
      shifts: [],
      inventoryLogs: [
        { type: "OUT", reason: "WASTE", quantity: 2, unitCost: 5000 },
        { type: "OUT", reason: "USAGE", quantity: 1, unitCost: 8000 },
        { type: "ADJUSTMENT", reason: "OPNAME", quantity: -3, unitCost: 4000 },
        { type: "ADJUSTMENT", reason: "MANUAL_ADJUSTMENT", quantity: -1, unitCost: 2000 },
      ],
    });

    expect(report.summary.lossStokNet).toBe(10000 + 8000 + (-12000) + (-2000));
    expect(report.lossStok).toEqual(
      expect.arrayContaining([
        { reason: "WASTE", netValue: 10000, netQuantity: 2, entryCount: 1 },
        { reason: "USAGE", netValue: 8000, netQuantity: 1, entryCount: 1 },
        { reason: "OPNAME", netValue: -12000, netQuantity: -3, entryCount: 1 },
        {
          reason: "MANUAL_ADJUSTMENT",
          netValue: -2000,
          netQuantity: -1,
          entryCount: 1,
        },
      ]),
    );
    expect(report.lossStok).toHaveLength(4);
  });

  it("nets a batch-undo IN log against the original OUT log of the same reason", () => {
    const report = buildFinancialReport({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      transactions: [],
      shifts: [],
      inventoryLogs: [
        { type: "OUT", reason: "WASTE", quantity: 5, unitCost: 3000 },
        { type: "IN", reason: "WASTE", quantity: 5, unitCost: 3000 },
      ],
    });

    expect(report.summary.lossStokNet).toBe(0);
    expect(report.lossStok).toEqual([
      { reason: "WASTE", netValue: 0, netQuantity: 0, entryCount: 2 },
    ]);
  });

  it("buckets null-reason rows as UNCLASSIFIED with 0 Rp when unitCost is null", () => {
    const report = buildFinancialReport({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      transactions: [],
      shifts: [],
      inventoryLogs: [
        { type: "OUT", reason: null, quantity: 4, unitCost: null },
        { type: "ADJUSTMENT", reason: null, quantity: -2, unitCost: null },
      ],
    });

    expect(report.summary.lossStokNet).toBe(0);
    expect(report.summary.lossStokUnclassifiedCount).toBe(2);
    expect(report.lossStok).toEqual([
      { reason: "UNCLASSIFIED", netValue: 0, netQuantity: 2, entryCount: 2 },
    ]);
  });

  it("subtracts lossStokNet from grossProfit and recomputes margin", () => {
    const report = buildFinancialReport({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      transactions: [
        {
          id: "tx-1",
          invoiceNumber: "INV-1",
          createdAt: new Date("2026-05-20T02:00:00.000Z"),
          status: "COMPLETED",
          paymentMethod: "CASH",
          total: 100000,
          amountPaid: 100000,
          discount: 0,
          salesName: null,
          salesperson: null,
          items: [
            {
              productId: "prod-a",
              productName: "Item A",
              quantity: 1,
              subtotal: 100000,
              unitCost: 60000,
              product: { category: { name: "Cat" } },
            },
          ],
        },
      ],
      shifts: [],
      inventoryLogs: [
        { type: "OUT", reason: "WASTE", quantity: 1, unitCost: 10000 },
      ],
    });

    expect(report.summary.lossStokNet).toBe(10000);
    expect(report.summary.grossProfit).toBe(40000 - 10000);
    expect(report.summary.grossMargin).toBe(0.3);
  });

  it("counts lines with missing cost without inventing gross profit", () => {
    const report = buildFinancialReport({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      transactions: [
        {
          id: "tx-no-cost",
          invoiceNumber: "INV-NO-COST",
          createdAt: new Date("2026-05-20T02:00:00.000Z"),
          status: "COMPLETED",
          paymentMethod: "TRANSFER",
          total: 125000,
          amountPaid: 125000,
          discount: 0,
          salesName: null,
          salesperson: null,
          items: [
            {
              productId: "prod-no-cost",
              productName: "Custom Print",
              quantity: 1,
              subtotal: 125000,
              unitCost: null,
              product: { category: { name: "Printing" } },
            },
          ],
        },
      ],
      shifts: [],
    });

    expect(report.summary).toMatchObject({
      revenue: 125000,
      collected: 125000,
      grossProfit: 0,
      grossMargin: 0,
      missingCostLineCount: 1,
    });
    expect(report.topProducts).toEqual([
      {
        productId: "prod-no-cost",
        productName: "Custom Print",
        quantity: 1,
        revenue: 125000,
        grossProfit: 0,
      },
    ]);
  });
});

describe("pickGranularity", () => {
  it("returns daily for ranges up to 60 days", () => {
    expect(pickGranularity(1)).toBe("daily");
    expect(pickGranularity(60)).toBe("daily");
  });

  it("returns weekly for ranges 61–180 days", () => {
    expect(pickGranularity(61)).toBe("weekly");
    expect(pickGranularity(180)).toBe("weekly");
  });

  it("returns monthly for ranges over 180 days", () => {
    expect(pickGranularity(181)).toBe("monthly");
    expect(pickGranularity(366)).toBe("monthly");
  });
});

describe("bucketKeyForDate", () => {
  it("uses Asia/Jakarta calendar day for daily bucketing", () => {
    // 23:30 WIB on 19th = 16:30 UTC on 19th
    const lateNightWIB = new Date("2026-05-19T16:30:00.000Z");
    expect(bucketKeyForDate(lateNightWIB, "daily")).toBe("2026-05-19");
  });

  it("rolls Sunday into the prior ISO week", () => {
    // 2026-05-17 is a Sunday — should belong to ISO week W20 (Mon 2026-05-11 → Sun 2026-05-17)
    const sunday = new Date("2026-05-17T05:00:00.000Z");
    expect(bucketKeyForDate(sunday, "weekly")).toBe("2026-W20");

    // 2026-05-18 is the Monday after — starts W21
    const monday = new Date("2026-05-18T05:00:00.000Z");
    expect(bucketKeyForDate(monday, "weekly")).toBe("2026-W21");
  });

  it("formats monthly buckets as YYYY-MM", () => {
    const mid = new Date("2026-05-19T05:00:00.000Z");
    expect(bucketKeyForDate(mid, "monthly")).toBe("2026-05");
  });
});

describe("buildFinancialReport — trend", () => {
  it("returns a daily trend with one zero-filled point per day for short ranges", () => {
    const report = buildFinancialReport({
      dateFrom: "2026-05-18",
      dateTo: "2026-05-20",
      transactions: [],
      shifts: [],
      inventoryLogs: [],
    });

    expect(report.trend.granularity).toBe("daily");
    expect(report.trend.points).toHaveLength(3);
    expect(report.trend.points.map((p) => p.bucketKey)).toEqual([
      "2026-05-18",
      "2026-05-19",
      "2026-05-20",
    ]);
    expect(report.trend.points.every((p) => p.omzet === 0 && p.cost === 0 && p.labaKotor === 0)).toBe(
      true,
    );
  });

  it("rolls a transaction into the correct daily bucket", () => {
    const report = buildFinancialReport({
      dateFrom: "2026-05-19",
      dateTo: "2026-05-20",
      transactions: [
        {
          id: "tx-1",
          invoiceNumber: "INV-1",
          createdAt: new Date("2026-05-20T02:00:00.000Z"),
          status: "COMPLETED",
          paymentMethod: "CASH",
          total: 100000,
          amountPaid: 100000,
          discount: 0,
          salesName: null,
          salesperson: null,
          items: [
            {
              productId: "prod-a",
              productName: "Item A",
              quantity: 1,
              subtotal: 100000,
              unitCost: 60000,
              product: { category: { name: "Cat" } },
            },
          ],
        },
      ],
      shifts: [],
      inventoryLogs: [],
    });

    const may19 = report.trend.points.find((p) => p.bucketKey === "2026-05-19");
    const may20 = report.trend.points.find((p) => p.bucketKey === "2026-05-20");

    expect(may19).toEqual({
      bucketKey: "2026-05-19",
      label: expect.any(String),
      omzet: 0,
      cost: 0,
      labaKotor: 0,
    });
    expect(may20).toEqual({
      bucketKey: "2026-05-20",
      label: expect.any(String),
      omzet: 100000,
      cost: 60000,
      labaKotor: 40000,
    });
  });

  it("adds inventory loss to the cost of the corresponding bucket", () => {
    const report = buildFinancialReport({
      dateFrom: "2026-05-19",
      dateTo: "2026-05-20",
      transactions: [],
      shifts: [],
      inventoryLogs: [
        {
          type: "OUT",
          reason: "WASTE",
          quantity: 2,
          unitCost: 5000,
          createdAt: new Date("2026-05-20T03:00:00.000Z"),
        },
      ],
    });

    const may20 = report.trend.points.find((p) => p.bucketKey === "2026-05-20")!;
    expect(may20.cost).toBe(10000);
    expect(may20.labaKotor).toBe(-10000);
  });

  it("subtracts opname surplus (negative quantity) from the bucket cost", () => {
    const report = buildFinancialReport({
      dateFrom: "2026-05-19",
      dateTo: "2026-05-20",
      transactions: [],
      shifts: [],
      inventoryLogs: [
        {
          type: "ADJUSTMENT",
          reason: "OPNAME",
          quantity: -3,
          unitCost: 4000,
          createdAt: new Date("2026-05-20T03:00:00.000Z"),
        },
      ],
    });

    const may20 = report.trend.points.find((p) => p.bucketKey === "2026-05-20")!;
    expect(may20.cost).toBe(-12000);
    expect(may20.labaKotor).toBe(12000);
  });

  it("preserves omzet − cost = labaKotor for every point", () => {
    const report = buildFinancialReport({
      dateFrom: "2026-05-18",
      dateTo: "2026-05-20",
      transactions: [
        {
          id: "tx-1",
          invoiceNumber: "INV-1",
          createdAt: new Date("2026-05-19T02:00:00.000Z"),
          status: "COMPLETED",
          paymentMethod: "CASH",
          total: 200000,
          amountPaid: 200000,
          discount: 0,
          salesName: null,
          salesperson: null,
          items: [
            {
              productId: "p1",
              productName: "P1",
              quantity: 1,
              subtotal: 200000,
              unitCost: 120000,
              product: { category: { name: "Cat" } },
            },
          ],
        },
      ],
      shifts: [],
      inventoryLogs: [
        {
          type: "OUT",
          reason: "WASTE",
          quantity: 1,
          unitCost: 5000,
          createdAt: new Date("2026-05-20T03:00:00.000Z"),
        },
      ],
    });

    for (const point of report.trend.points) {
      expect(point.labaKotor).toBe(point.omzet - point.cost);
    }
  });

  it("uses weekly granularity for 61-day range", () => {
    const report = buildFinancialReport({
      dateFrom: "2026-03-21",
      dateTo: "2026-05-20",
      transactions: [],
      shifts: [],
      inventoryLogs: [],
    });

    expect(report.trend.granularity).toBe("weekly");
    // ISO weeks W12..W21 = 10 buckets
    expect(report.trend.points.length).toBeGreaterThanOrEqual(9);
    expect(report.trend.points.length).toBeLessThanOrEqual(10);
  });

  it("uses monthly granularity for ranges over 180 days", () => {
    const report = buildFinancialReport({
      dateFrom: "2025-09-01",
      dateTo: "2026-05-20",
      transactions: [],
      shifts: [],
      inventoryLogs: [],
    });

    expect(report.trend.granularity).toBe("monthly");
    expect(report.trend.points.map((p) => p.bucketKey)).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
  });
});
