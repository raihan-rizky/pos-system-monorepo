import { describe, expect, it } from "vitest";
import { buildCustomerDetailRecap } from "../recap-core";

describe("manual receivables in customer recap", () => {
  const customer = {
    id: "customer-1", name: "Pelanggan", type: "UMUM" as const,
    totalDebt: 70000, createdAt: new Date("2026-04-01T00:00:00Z"), lastVisitAt: null,
  };

  it("includes manual balances and period payments without creating sales or DP counts", () => {
    const recap = buildCustomerDetailRecap({
      customer, dateFrom: "2026-05-01", dateTo: "2026-05-03",
      transactions: [], debtPaymentLogs: [],
      manualReceivables: [
        {
          id: "manual-1", customerId: customer.id, amount: 100000, amountPaid: 30000,
          debtDate: new Date("2026-05-01T00:00:00Z"),
          payments: [{ amount: 30000, createdAt: new Date("2026-05-02T00:00:00Z") }],
        },
        {
          id: "manual-other", customerId: "other", amount: 999000, amountPaid: 0,
          debtDate: new Date("2026-05-01T00:00:00Z"), payments: [],
        },
      ],
    });

    expect(recap.summary).toMatchObject({ totalSpent: 0, totalOrders: 0, debtRemaining: 70000, debtPaidInPeriod: 30000 });
    expect(recap.topProducts).toEqual([]);
    expect(recap.trend.points[0]).toMatchObject({
      bucketKey: "2026-05-01", runningDebtRemaining: 70000, debtUnpaidAmount: 70000,
      spent: 0, orderCount: 0, dpTransactionCount: 0, dpPaidOffCount: 0,
    });
  });

  it("groups paid-off manual debt by its debt date and filters payment dates in WIB", () => {
    const recap = buildCustomerDetailRecap({
      customer: { ...customer, totalDebt: 0 }, dateFrom: "2026-05-01", dateTo: "2026-05-03",
      transactions: [], debtPaymentLogs: [],
      manualReceivables: [{
        id: "manual-1", customerId: customer.id, amount: 100000, amountPaid: 100000,
        debtDate: new Date("2026-05-01T00:00:00Z"),
        payments: [
          { amount: 40000, createdAt: new Date("2026-04-30T16:59:59Z") },
          { amount: 60000, createdAt: new Date("2026-05-02T17:00:00Z") },
        ],
      }],
    });
    expect(recap.summary.debtPaidInPeriod).toBe(60000);
    expect(recap.trend.points[0]).toMatchObject({ debtPaidOffAmount: 100000, debtUnpaidAmount: 0, runningDebtRemaining: 0, dpTransactionCount: 0 });
  });

  it("recognizes fractional settlement without losing paid-off totals or payment days", () => {
    const recap = buildCustomerDetailRecap({
      customer: { ...customer, totalDebt: 0 }, dateFrom: "2026-05-01", dateTo: "2026-05-03",
      transactions: [], debtPaymentLogs: [],
      manualReceivables: [{
        id: "fractional-debt", customerId: customer.id, amount: 0.8, amountPaid: 0.8,
        debtDate: new Date("2026-05-01T00:00:00Z"),
        payments: [
          { amount: 0.1, createdAt: new Date("2026-05-01T03:00:00Z") },
          { amount: 0.7, createdAt: new Date("2026-05-03T00:00:00Z") },
        ],
      }],
    });

    expect(recap.summary).toMatchObject({ debtPaidOffInPeriod: 0.8, averagePaymentDays: 2 });
    expect(recap.trend.points[0]).toMatchObject({
      debtPaidOffAmount: 0.8, averagePaymentDays: 2, debtUnpaidAmount: 0,
      runningDebtRemaining: 0, dpTransactionCount: 0,
    });
  });
});
