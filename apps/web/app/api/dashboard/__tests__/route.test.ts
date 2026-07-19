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

  it("queries revenue dashboard buckets by invoiceDate business date", async () => {
    const { GET } = await import("../route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(transactionFindManyMock.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        invoiceDate: expect.objectContaining({ gte: expect.any(Date) }),
      }),
    );
    expect(transactionFindManyMock.mock.calls[0][0].where).not.toHaveProperty(
      "createdAt",
    );
    expect(transactionFindManyMock.mock.calls[0][0].select).toEqual(
      expect.objectContaining({ invoiceDate: true, paymentMethod: true }),
    );
    expect(transactionGroupByMock.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        invoiceDate: expect.objectContaining({ gte: expect.any(Date) }),
      }),
    );
  });

  it("reads overlapping revenue buckets once while preserving dashboard totals", async () => {
    vi.setSystemTime(new Date("2026-07-03T04:00:00.000Z"));

    const previousMonthRow = {
      invoiceDate: new Date("2026-06-27T03:00:00.000Z"),
      total: 100,
      amountPaid: 100,
      status: "COMPLETED",
      paymentMethod: "CASH",
      items: [{ quantity: 1, unitCost: 20, subtotal: 100 }],
    };
    const monthRow = {
      invoiceDate: new Date("2026-07-01T03:00:00.000Z"),
      total: 500,
      amountPaid: 200,
      status: "DP",
      paymentMethod: "TRANSFER",
      items: [{ quantity: 1, unitCost: 300, subtotal: 500 }],
    };
    const todayRow = {
      invoiceDate: new Date("2026-07-03T03:00:00.000Z"),
      total: 1_000,
      amountPaid: 1_000,
      status: "COMPLETED",
      paymentMethod: "CASH",
      items: [{ quantity: 2, unitCost: 200, subtotal: 1_000 }],
    };

    transactionFindManyMock.mockImplementation(async (query) => {
      if (query.include?.items) return [];
      if (query.select?.invoiceDate && query.select?.paymentMethod) {
        return [previousMonthRow, monthRow, todayRow];
      }
      if (query.select?.paymentMethod) return [todayRow];
      if (query.select?.invoiceDate) {
        return [previousMonthRow, monthRow, todayRow];
      }

      const rangeStart = query.where?.invoiceDate?.gte as Date;
      return rangeStart.getDate() === 1 ? [monthRow, todayRow] : [todayRow];
    });

    const { GET } = await import("../route");
    const response = await GET();
    const body = await response.json();

    expect(transactionFindManyMock).toHaveBeenCalledTimes(2);
    expect(transactionFindManyMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        select: expect.objectContaining({
          invoiceDate: true,
          paymentMethod: true,
          items: expect.any(Object),
        }),
      }),
    );
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
