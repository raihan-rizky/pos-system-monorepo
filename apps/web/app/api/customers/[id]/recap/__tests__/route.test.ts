import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const customerFindFirstMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const debtPaymentLogFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    customer: { findFirst: customerFindFirstMock },
    transaction: { findMany: transactionFindManyMock },
    debtPaymentLog: { findMany: debtPaymentLogFindManyMock },
  },
}));

describe("GET /api/customers/[id]/recap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    customerFindFirstMock.mockResolvedValue({
      id: "customer-1",
      name: "Customer One",
      type: "UMUM",
      totalDebt: 50000,
      createdAt: new Date("2026-04-01T02:00:00.000Z"),
      lastVisitAt: new Date("2026-05-02T02:00:00.000Z"),
    });
    transactionFindManyMock.mockResolvedValue([
      {
        id: "tx-1",
        customerId: "customer-1",
        createdAt: new Date("2026-05-02T03:00:00.000Z"),
        status: "COMPLETED",
        total: 125000,
        items: [
          {
            productId: "prod-1",
            productName: "Banner",
            quantity: 1,
            subtotal: 125000,
          },
        ],
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

  it("returns 404 without leaking customers outside the current store", async () => {
    customerFindFirstMock.mockResolvedValueOnce(null);

    const response = await GET(
      new Request(
        "http://localhost/api/customers/customer-other-store/recap?dateFrom=2026-05-01&dateTo=2026-05-02",
      ),
      { params: Promise.resolve({ id: "customer-other-store" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe("NotFound");
    expect(customerFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "customer-other-store", storeId: "store-main" },
      }),
    );
    expect(transactionFindManyMock).not.toHaveBeenCalled();
  });

  it("returns a customer recap in a data envelope", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/customers/customer-1/recap?dateFrom=2026-05-01&dateTo=2026-05-02",
      ),
      { params: Promise.resolve({ id: "customer-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      id: "customer-1",
      summary: {
        totalSpent: 125000,
        debtRemaining: 50000,
        debtPaidInPeriod: 25000,
      },
    });
    expect(transactionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-main",
          customerId: "customer-1",
        }),
      }),
    );
  });
});
