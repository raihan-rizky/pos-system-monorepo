import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const transactionGroupByMock = vi.hoisted(() => vi.fn());
const transactionAggregateMock = vi.hoisted(() => vi.fn());
const productCountMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
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
    product: { count: productCountMock, findMany: productFindManyMock },
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
    productFindManyMock.mockResolvedValue([]);
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

  it("returns top five products per sales group and keeps the flat top-products list", async () => {
    const groupedRows = [
      ...Array.from({ length: 6 }, (_, index) => ({
        productId: `atk-${index + 1}`,
        productName: `ATK ${index + 1}`,
        salesGroup: "ATK",
        quantity: 60 - index,
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        productId: `paper-${index + 1}`,
        productName: `Kertas ${index + 1}`,
        salesGroup: "PAPER",
        quantity: 50 - index,
      })),
      { productId: "cartridge", productName: "Cartridge HP", salesGroup: "CARTRIDGE", quantity: 12 },
      { productId: "ink", productName: "Tinta", salesGroup: "INK", quantity: 11 },
      { productId: "toner", productName: "Toner HP", salesGroup: "OTHER", quantity: 10 },
      { productId: null, productName: "Jasa", salesGroup: "OTHER", quantity: 9 },
    ].sort((left, right) => right.quantity - left.quantity);

    transactionItemGroupByMock.mockResolvedValue(
      groupedRows.map((row) => ({
        productId: row.productId,
        productName: row.productName,
        _sum: { quantity: row.quantity, subtotal: row.quantity * 100 },
      })),
    );
    productFindManyMock.mockResolvedValue(
      groupedRows
        .filter((row) => row.productId !== null)
        .map((row) => ({
          id: row.productId,
          category: { salesGroup: row.salesGroup },
        })),
    );

    const { GET } = await import("../route");
    const response = await GET();
    const body = await response.json();
    expect(body.topProductGroups).toBeDefined();
    const groups = body.topProductGroups as Array<{
      key: string;
      label: string;
      products: Array<{ name: string; quantity: number }>;
    }>;

    expect(body.topProducts).toHaveLength(5);
    expect(body.topProducts.map((product: { name: string }) => product.name)).toEqual([
      "ATK 1",
      "ATK 2",
      "ATK 3",
      "ATK 4",
      "ATK 5",
    ]);
    expect(
      groups.map(({ key, label, products }) => [key, label, products.length]),
    ).toEqual([
      ["ATK", "ATK", 5],
      ["PAPER", "Kertas", 5],
      ["CARTRIDGE", "Cartridge", 1],
      ["INK", "Tinta", 1],
      ["OTHER", "Lainnya", 2],
    ]);
    expect(groups.find(({ key }) => key === "PAPER")?.products[0]?.name).toBe("Kertas 1");
    expect(groups.find(({ key }) => key === "OTHER")?.products.map(({ name }) => name)).toEqual([
      "Toner HP",
      "Jasa",
    ]);
  });
});
