import { describe, expect, it } from "vitest";
import {
  buildCustomerDetailRecap,
  buildCustomerRecap,
  buildCustomerRecapRange,
} from "../recap-core";

describe("buildCustomerRecapRange", () => {
  it("builds Jakarta date ranges for customer recap presets", () => {
    const now = new Date("2026-05-20T10:30:00.000Z");

    expect(buildCustomerRecapRange("month", now)).toEqual({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-20",
    });
    expect(buildCustomerRecapRange("30d", now)).toEqual({
      dateFrom: "2026-04-21",
      dateTo: "2026-05-20",
    });
    expect(buildCustomerRecapRange("90d", now)).toEqual({
      dateFrom: "2026-02-20",
      dateTo: "2026-05-20",
    });
    expect(buildCustomerRecapRange("year", now)).toEqual({
      dateFrom: "2026-01-01",
      dateTo: "2026-05-20",
    });
  });
});

describe("buildCustomerRecap", () => {
  it("summarizes page-level customer activity for a selected period", () => {
    const recap = buildCustomerRecap({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-03",
      customers: [
        {
          id: "new-customer",
          name: "New Customer",
          type: "UMUM",
          totalDebt: 100000,
          createdAt: new Date("2026-05-01T02:00:00.000Z"),
          lastVisitAt: new Date("2026-05-02T02:00:00.000Z"),
        },
        {
          id: "returning-customer",
          name: "Returning Customer",
          type: "INDUSTRI",
          totalDebt: 50000,
          createdAt: new Date("2026-04-10T02:00:00.000Z"),
          lastVisitAt: new Date("2026-05-03T02:00:00.000Z"),
        },
        {
          id: "new-without-order",
          name: "New Without Order",
          type: "UMUM",
          totalDebt: 0,
          createdAt: new Date("2026-05-02T02:00:00.000Z"),
          lastVisitAt: null,
        },
        {
          id: "churn-risk",
          name: "Churn Risk",
          type: "PEMERINTAH",
          totalDebt: 0,
          createdAt: new Date("2026-01-10T02:00:00.000Z"),
          lastVisitAt: new Date("2026-02-01T02:00:00.000Z"),
        },
      ],
      transactions: [
        {
          id: "tx-new",
          customerId: "new-customer",
          createdAt: new Date("2026-05-01T03:00:00.000Z"),
          status: "COMPLETED",
          total: 120000,
          items: [],
        },
        {
          id: "tx-returning-1",
          customerId: "returning-customer",
          createdAt: new Date("2026-05-02T03:00:00.000Z"),
          status: "DP",
          total: 200000,
          items: [],
        },
        {
          id: "tx-returning-same-day",
          customerId: "returning-customer",
          createdAt: new Date("2026-05-02T05:00:00.000Z"),
          status: "COMPLETED",
          total: 50000,
          items: [],
        },
        {
          id: "tx-returning-2",
          customerId: "returning-customer",
          createdAt: new Date("2026-05-03T03:00:00.000Z"),
          status: "COMPLETED",
          total: 80000,
          items: [],
        },
        {
          id: "tx-ignored",
          customerId: "returning-customer",
          createdAt: new Date("2026-05-03T04:00:00.000Z"),
          status: "VOIDED",
          total: 999999,
          items: [],
        },
      ],
      debtPaymentLogs: [
        {
          customerId: "returning-customer",
          amount: 40000,
          createdAt: new Date("2026-05-02T04:00:00.000Z"),
        },
      ],
    });

    expect(recap.summary).toMatchObject({
      newCustomers: 2,
      returningCustomers: 1,
      churnedCustomers: 1,
      totalDebtOutstanding: 150000,
      debtCollectedInPeriod: 40000,
      avgOrderValue: 450000 / 4,
      orderFrequency: 2,
      repeatPurchaseRate: 0.5,
    });
    expect(recap.byType).toEqual([
      { type: "INDUSTRI", customerCount: 1, revenue: 330000, debtAmount: 50000 },
      { type: "PEMERINTAH", customerCount: 1, revenue: 0, debtAmount: 0 },
      { type: "UMUM", customerCount: 2, revenue: 120000, debtAmount: 100000 },
    ]);
    expect(recap.topSpenders).toEqual([
      {
        id: "returning-customer",
        name: "Returning Customer",
        type: "INDUSTRI",
        spentInPeriod: 330000,
        orderCount: 3,
        lastVisitAt: "2026-05-03T02:00:00.000Z",
      },
      {
        id: "new-customer",
        name: "New Customer",
        type: "UMUM",
        spentInPeriod: 120000,
        orderCount: 1,
        lastVisitAt: "2026-05-02T02:00:00.000Z",
      },
    ]);
    expect(recap.trend.points.map((point) => point.revenue)).toEqual([
      120000,
      250000,
      80000,
    ]);
    expect(recap.trend.points.map((point) => point.orderCount)).toEqual([1, 2, 1]);
    expect(recap.trend.points.map((point) => point.newCustomers)).toEqual([1, 1, 0]);
    expect(recap.trend.points.map((point) => point.returningCustomers)).toEqual([0, 1, 1]);
  });
});

describe("buildCustomerDetailRecap", () => {
  it("summarizes one customer's period activity and top products", () => {
    const recap = buildCustomerDetailRecap({
      customer: {
        id: "customer-1",
        name: "Agen Sabar",
        type: "AGEN",
        totalDebt: 75000,
        createdAt: new Date("2026-04-01T02:00:00.000Z"),
        lastVisitAt: new Date("2026-05-02T02:00:00.000Z"),
      },
      dateFrom: "2026-05-01",
      dateTo: "2026-05-02",
      transactions: [
        {
          id: "tx-1",
          customerId: "customer-1",
          createdAt: new Date("2026-05-01T03:00:00.000Z"),
          status: "COMPLETED",
          total: 100000,
          items: [
            {
              productId: "prod-a",
              productName: "Banner",
              quantity: 2,
              subtotal: 60000,
            },
            {
              productId: "prod-b",
              productName: "Sticker",
              quantity: 1,
              subtotal: 40000,
            },
          ],
        },
        {
          id: "tx-2",
          customerId: "customer-1",
          createdAt: new Date("2026-05-02T03:00:00.000Z"),
          status: "DP",
          total: 50000,
          items: [
            {
              productId: "prod-a",
              productName: "Banner",
              quantity: 1,
              subtotal: 50000,
            },
          ],
        },
        {
          id: "tx-ignored",
          customerId: "customer-1",
          createdAt: new Date("2026-05-02T04:00:00.000Z"),
          status: "PENDING_APPROVAL",
          total: 999999,
          items: [],
        },
      ],
      debtPaymentLogs: [
        {
          customerId: "customer-1",
          amount: 25000,
          createdAt: new Date("2026-05-02T05:00:00.000Z"),
        },
      ],
    });

    expect(recap.summary).toEqual({
      totalSpent: 150000,
      totalOrders: 2,
      avgOrderValue: 75000,
      debtRemaining: 75000,
      debtPaidInPeriod: 25000,
    });
    expect(recap.trend.points.map((point) => point.spent)).toEqual([
      100000,
      50000,
    ]);
    expect(recap.topProducts).toEqual([
      {
        productId: "prod-a",
        productName: "Banner",
        quantity: 3,
        subtotal: 110000,
      },
      {
        productId: "prod-b",
        productName: "Sticker",
        quantity: 1,
        subtotal: 40000,
      },
    ]);
  });
});
