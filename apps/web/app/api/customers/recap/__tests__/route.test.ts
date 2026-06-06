import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const customerFindManyMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const debtPaymentLogFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    customer: { findMany: customerFindManyMock },
    transaction: { findMany: transactionFindManyMock },
    debtPaymentLog: { findMany: debtPaymentLogFindManyMock },
  },
}));

describe("GET /api/customers/recap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    customerFindManyMock.mockResolvedValue([
      {
        id: "customer-1",
        name: "Customer One",
        type: "UMUM",
        totalDebt: 100000,
        createdAt: new Date("2026-05-01T02:00:00.000Z"),
        lastVisitAt: new Date("2026-05-02T02:00:00.000Z"),
      },
    ]);
    transactionFindManyMock.mockResolvedValue([
      {
        id: "tx-1",
        customerId: "customer-1",
        createdAt: new Date("2026-05-02T03:00:00.000Z"),
        status: "COMPLETED",
        total: 125000,
        items: [],
      },
    ]);
    debtPaymentLogFindManyMock.mockResolvedValue([
      {
        customerId: "customer-1",
        amount: 25000,
        createdAt: new Date("2026-05-02T04:00:00.000Z"),
      },
    ]);
  });

  it("returns structured validation errors for invalid dates", async () => {
    const response = await GET(
      new Request("http://localhost/api/customers/recap?dateFrom=bad&dateTo=2026-05-02"),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.code).toBe("ValidationError");
    expect(customerFindManyMock).not.toHaveBeenCalled();
  });

  it("returns store-scoped recap data in a data envelope", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/customers/recap?dateFrom=2026-05-01&dateTo=2026-05-02",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.summary).toMatchObject({
      newCustomers: 1,
      totalDebtOutstanding: 100000,
      debtCollectedInPeriod: 25000,
    });
    expect(body.data.trend.points).toEqual([
      expect.objectContaining({
        bucketKey: "2026-05-01",
        newCustomers: 1,
        returningCustomers: 0,
      }),
      expect.objectContaining({
        bucketKey: "2026-05-02",
        newCustomers: 0,
        returningCustomers: 1,
      }),
    ]);
    expect(customerFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: "store-main" },
      }),
    );
    expect(transactionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "store-main" }),
      }),
    );
    expect(debtPaymentLogFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "store-main" }),
      }),
    );
  });
});
