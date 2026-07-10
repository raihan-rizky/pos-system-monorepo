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

describe("GET /api/customers/recap/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({ id: "owner-1", storeId: "store-main" });
    handleAuthErrorMock.mockReturnValue(null);
    customerFindManyMock.mockResolvedValue([
      {
        id: "customer-1",
        name: "Customer One",
        type: "AGEN",
        totalDebt: 100_000,
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
        total: 125_000,
        items: [
          { productId: "p-1", productName: "Produk 1", quantity: 2, subtotal: 125_000 },
        ],
      },
    ]);
    debtPaymentLogFindManyMock.mockResolvedValue([]);
  });

  it("returns export aggregates in a store-scoped data envelope", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/customers/recap/export?dateFrom=2026-05-01&dateTo=2026-05-02",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.groups[0]).toMatchObject({
      type: "AGEN",
      customers: [expect.objectContaining({ name: "Customer One", totalSpent: 125_000 })],
    });
    expect(body.data.groups).toHaveLength(4);
    expect(customerFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: "store-main" } }),
    );
    expect(transactionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ storeId: "store-main" }) }),
    );
    expect(debtPaymentLogFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ storeId: "store-main" }) }),
    );
  });

  it("rejects ranges longer than one year before querying", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/customers/recap/export?dateFrom=2025-01-01&dateTo=2026-05-02",
      ),
    );

    expect(response.status).toBe(400);
    expect(customerFindManyMock).not.toHaveBeenCalled();
  });
});
