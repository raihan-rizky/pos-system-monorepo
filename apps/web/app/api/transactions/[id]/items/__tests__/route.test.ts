import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionUpdateMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    transaction: {
      findFirst: transactionFindFirstMock,
      update: transactionUpdateMock,
    },
    $transaction: dbTransactionMock,
  },
  Prisma: {
    Decimal: class Decimal {
      constructor(public value: number | string) {}
      toNumber() { return Number(this.value); }
      toString() { return String(this.value); }
    }
  }
}));

describe("PATCH /api/transactions/[id]/items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "User One",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    transactionFindFirstMock.mockResolvedValue({
      id: "tx-1",
      storeId: "store-main",
      status: "PENDING_APPROVAL",
    });
    transactionUpdateMock.mockResolvedValue({ id: "tx-1" });
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        transaction: { update: transactionUpdateMock },
      })
    );
  });

  it("updates items and recalculates totals for a pending transaction", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/transactions/tx-1/items", {
        method: "PATCH",
        body: JSON.stringify({
          items: [
            {
              productId: "cmqg9c60q0007w194w9377nn1",
              productName: "Product 1",
              quantity: 2,
              unitPrice: 50000,
              appliedUnitPrice: 50000,
              originalUnitPrice: 50000,
              subtotal: 100000,
            },
            {
              productId: "cmqg9c60q0007w194w9377nn2",
              productName: "Product 2",
              quantity: 1,
              unitPrice: 20000,
              appliedUnitPrice: 20000,
              originalUnitPrice: 20000,
              subtotal: 20000,
            }
          ],
        }),
      }),
      { params: Promise.resolve({ id: "tx-1" }) }
    );

    expect(response.status).toBe(200);
    // Since items sum to 120,000
    expect(dbTransactionMock).toHaveBeenCalled();
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tx-1" },
        data: expect.objectContaining({
          subtotal: 120000,
          total: 120000,
          items: expect.objectContaining({
            deleteMany: {},
            create: expect.any(Array)
          })
        }),
      })
    );
  });

});
