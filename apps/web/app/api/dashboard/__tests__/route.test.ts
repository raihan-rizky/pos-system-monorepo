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
    expect(transactionFindManyMock.mock.calls[2][0].select).toEqual(
      expect.objectContaining({ invoiceDate: true }),
    );
    expect(transactionGroupByMock.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        invoiceDate: expect.objectContaining({ gte: expect.any(Date) }),
      }),
    );
  });
});
