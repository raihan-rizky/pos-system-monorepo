import { describe, expect, it } from "vitest";
import {
  buildDashboardRevenueBuckets,
  type DashboardRevenueRow,
} from "../dashboard-revenue-buckets";

/**
 * These cases pin the money rules that used to live inline in
 * app/api/dashboard/route.ts. They are the contract the SQL aggregation must
 * keep producing, so treat any change here as a change to what the owner sees
 * on the dashboard.
 */

function bounds(nowIso: string) {
  const now = new Date(nowIso);
  return {
    now,
    todayStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    monthStart: new Date(now.getFullYear(), now.getMonth(), 1),
  };
}

function row(overrides: Partial<DashboardRevenueRow>): DashboardRevenueRow {
  return {
    invoiceDate: new Date("2026-07-03T03:00:00.000Z"),
    status: "COMPLETED",
    total: 0,
    amountPaid: 0,
    paymentMethod: "CASH",
    profit: 0,
    ...overrides,
  };
}

describe("buildDashboardRevenueBuckets", () => {
  it("counts amountPaid for DP transactions and total for the rest", () => {
    const result = buildDashboardRevenueBuckets(
      [
        row({ status: "DP", total: 500, amountPaid: 200, profit: 200 }),
        row({ status: "COMPLETED", total: 1_000, amountPaid: 1_000, profit: 600 }),
      ],
      bounds("2026-07-03T04:00:00.000Z"),
    );

    expect(result.todayRevenue).toBe(1_200);
    expect(result.todayProfit).toBe(800);
  });

  it("excludes rows before the month start from monthly totals", () => {
    const result = buildDashboardRevenueBuckets(
      [
        row({
          invoiceDate: new Date("2026-06-27T03:00:00.000Z"),
          total: 100,
          amountPaid: 100,
          profit: 80,
        }),
        row({ total: 1_000, amountPaid: 1_000, profit: 600 }),
      ],
      bounds("2026-07-03T04:00:00.000Z"),
    );

    expect(result.monthlyRevenue).toBe(1_000);
    expect(result.monthlyProfit).toBe(600);
  });

  it("limits the payment mix to today and counts transactions per method", () => {
    const result = buildDashboardRevenueBuckets(
      [
        row({ total: 1_000, amountPaid: 1_000, profit: 600, paymentMethod: "CASH" }),
        row({ total: 250, amountPaid: 250, profit: 50, paymentMethod: "CASH" }),
        row({
          invoiceDate: new Date("2026-07-01T03:00:00.000Z"),
          total: 900,
          amountPaid: 900,
          profit: 100,
          paymentMethod: "TRANSFER",
        }),
      ],
      bounds("2026-07-03T04:00:00.000Z"),
    );

    expect(result.paymentMixToday).toEqual([
      { method: "CASH", revenue: 1_250, transactionCount: 2 },
    ]);
  });

  it("buckets the chart by Jakarta business date, oldest first", () => {
    const result = buildDashboardRevenueBuckets(
      [
        // 23:30 UTC on 2026-07-01 is already 2026-07-02 in Jakarta (UTC+7).
        row({
          invoiceDate: new Date("2026-07-01T23:30:00.000Z"),
          total: 400,
          amountPaid: 400,
          profit: 100,
        }),
      ],
      bounds("2026-07-03T04:00:00.000Z"),
    );

    expect(result.revenueChart).toHaveLength(7);
    expect(result.revenueChart[0].date < result.revenueChart[6].date).toBe(true);
    expect(result.revenueChart[6].date).toBe("2026-07-03");

    const byDate = new Map(result.revenueChart.map((p) => [p.date, p]));
    expect(byDate.get("2026-07-02")).toMatchObject({ revenue: 400, profit: 100 });
    expect(byDate.get("2026-07-01")).toMatchObject({ revenue: 0, profit: 0 });
  });

  it("ignores rows that fall outside the 7-day chart window", () => {
    const result = buildDashboardRevenueBuckets(
      [
        row({
          invoiceDate: new Date("2026-06-27T03:00:00.000Z"),
          total: 100,
          amountPaid: 100,
          profit: 80,
        }),
      ],
      bounds("2026-07-09T04:00:00.000Z"),
    );

    expect(result.revenueChart.some((point) => point.date === "2026-06-27")).toBe(
      false,
    );
    expect(result.revenueChart.every((point) => point.revenue === 0)).toBe(true);
  });

  it("accepts Decimal-like values from the driver without losing precision", () => {
    const decimalLike = (value: string) => ({ toString: () => value });

    const result = buildDashboardRevenueBuckets(
      [
        row({
          total: decimalLike("1500.50"),
          amountPaid: decimalLike("1500.50"),
          profit: decimalLike("300.25"),
        }),
      ],
      bounds("2026-07-03T04:00:00.000Z"),
    );

    expect(result.todayRevenue).toBeCloseTo(1_500.5, 2);
    expect(result.todayProfit).toBeCloseTo(300.25, 2);
  });

  it("reproduces the totals the route reported before the SQL rewrite", () => {
    const result = buildDashboardRevenueBuckets(
      [
        row({
          invoiceDate: new Date("2026-06-27T03:00:00.000Z"),
          status: "COMPLETED",
          total: 100,
          amountPaid: 100,
          profit: 80,
        }),
        row({
          invoiceDate: new Date("2026-07-01T03:00:00.000Z"),
          status: "DP",
          total: 500,
          amountPaid: 200,
          profit: 200,
          paymentMethod: "TRANSFER",
        }),
        row({
          invoiceDate: new Date("2026-07-03T03:00:00.000Z"),
          status: "COMPLETED",
          total: 1_000,
          amountPaid: 1_000,
          profit: 600,
          paymentMethod: "CASH",
        }),
      ],
      bounds("2026-07-03T04:00:00.000Z"),
    );

    expect(result.todayRevenue).toBe(1_000);
    expect(result.todayProfit).toBe(600);
    expect(result.monthlyRevenue).toBe(1_200);
    expect(result.monthlyProfit).toBe(800);
    expect(result.paymentMixToday).toEqual([
      { method: "CASH", revenue: 1_000, transactionCount: 1 },
    ]);

    const byDate = new Map(
      result.revenueChart.map((p) => [p.date, { revenue: p.revenue, profit: p.profit }]),
    );
    expect(byDate.get("2026-06-27")).toEqual({ revenue: 100, profit: 80 });
    expect(byDate.get("2026-07-01")).toEqual({ revenue: 200, profit: 200 });
    expect(byDate.get("2026-07-03")).toEqual({ revenue: 1_000, profit: 600 });
  });
});
