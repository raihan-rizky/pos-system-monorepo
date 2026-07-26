import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const transactionGroupByMock = vi.hoisted(() => vi.fn());
const transactionAggregateMock = vi.hoisted(() => vi.fn());
const productCountMock = vi.hoisted(() => vi.fn());
const queryRawMock = vi.hoisted(() => vi.fn());
const transactionItemGroupByMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    transaction: {
      findMany: transactionFindManyMock,
      groupBy: transactionGroupByMock,
      aggregate: transactionAggregateMock,
    },
    transactionItem: { groupBy: transactionItemGroupByMock },
    product: { count: productCountMock },
    $queryRaw: queryRawMock,
  },
}));

describe("GET /api/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T04:00:00.000Z"));
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      role: "OWNER",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    transactionFindManyMock.mockResolvedValue([]);
    transactionGroupByMock.mockResolvedValue([]);
    transactionAggregateMock.mockResolvedValue({ _sum: { total: 0, amountPaid: 0 } });
    productCountMock.mockResolvedValue(0);
    queryRawMock.mockResolvedValue([]);
    transactionItemGroupByMock.mockResolvedValue([]);
  });

  /** Prisma's $queryRaw is a tag function: [templateStrings, ...boundValues]. */
  function revenueSqlCall() {
    const call = queryRawMock.mock.calls.find((args) =>
      (args[0] as string[]).join(" ").includes("pos_transaction_items"),
    );
    if (!call) throw new Error("revenue aggregation query was not issued");
    return { sql: (call[0] as string[]).join("?"), params: call.slice(1) };
  }

  it("aggregates revenue per transaction in SQL, bounded by invoiceDate", async () => {
    const { GET } = await import("../route");

    const response = await GET();
    expect(response.status).toBe(200);

    const { sql, params } = revenueSqlCall();

    // Profit is summed in SQL so line items never cross the wire.
    expect(sql).toContain("pos_transactions");
    expect(sql).toContain("pos_transaction_items");
    expect(sql).toMatch(/SUM\(/);
    expect(sql).toContain('t."invoiceDate" >=');

    // Business date must stay invoiceDate, never createdAt.
    expect(sql).not.toContain("createdAt");

    expect(params[0]).toBe("store-main");
    expect(params[1]).toBeInstanceOf(Date);

    expect(transactionGroupByMock.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        invoiceDate: expect.objectContaining({ gte: expect.any(Date) }),
      }),
    );
  });

  it("reads overlapping revenue buckets once while preserving dashboard totals", async () => {
    vi.setSystemTime(new Date("2026-07-03T04:00:00.000Z"));

    // One row per transaction now, with profit already summed by the database.
    const previousMonthRow = {
      invoiceDate: new Date("2026-06-27T03:00:00.000Z"),
      total: 100,
      amountPaid: 100,
      status: "COMPLETED",
      paymentMethod: "CASH",
      profit: 80,
    };
    const monthRow = {
      invoiceDate: new Date("2026-07-01T03:00:00.000Z"),
      total: 500,
      amountPaid: 200,
      status: "DP",
      paymentMethod: "TRANSFER",
      profit: 200,
    };
    const todayRow = {
      invoiceDate: new Date("2026-07-03T03:00:00.000Z"),
      total: 1_000,
      amountPaid: 1_000,
      status: "COMPLETED",
      paymentMethod: "CASH",
      profit: 600,
    };

    queryRawMock.mockImplementation(async (strings: string[]) => {
      if (strings.join(" ").includes("pos_transaction_items")) {
        return [previousMonthRow, monthRow, todayRow];
      }
      return []; // low-stock query
    });

    const { GET } = await import("../route");
    const response = await GET();
    const body = await response.json();

    // Exactly one pass over the transaction range — no per-bucket re-query.
    expect(
      queryRawMock.mock.calls.filter((args) =>
        (args[0] as string[]).join(" ").includes("pos_transaction_items"),
      ),
    ).toHaveLength(1);
    expect(body).toEqual(
      expect.objectContaining({
        todayRevenue: 1_000,
        todayProfit: 600,
        monthlyRevenue: 1_200,
        monthlyProfit: 800,
        paymentMixToday: [
          { method: "CASH", revenue: 1_000, transactionCount: 1 },
        ],
      }),
    );

    const chartByDate = new Map(
      body.revenueChart.map((point: { date: string; revenue: number; profit: number }) => [
        point.date,
        { revenue: point.revenue, profit: point.profit },
      ]),
    );
    expect(chartByDate.get("2026-06-27")).toEqual({ revenue: 100, profit: 80 });
    expect(chartByDate.get("2026-07-01")).toEqual({ revenue: 200, profit: 200 });
    expect(chartByDate.get("2026-07-03")).toEqual({ revenue: 1_000, profit: 600 });
  });
});
