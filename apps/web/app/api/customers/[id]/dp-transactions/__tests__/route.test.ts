import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const canPerformMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const customerFindFirstMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  canAuthenticatedUserPerform: canPerformMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    customer: {
      findFirst: customerFindFirstMock,
    },
    transaction: {
      findMany: transactionFindManyMock,
    },
  },
}));

describe("GET /api/customers/[id]/dp-transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canPerformMock.mockResolvedValue(true);
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Admin",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    customerFindFirstMock.mockResolvedValue({
      id: "customer-1",
      name: "Agen Sabar Subur",
    });
    transactionFindManyMock.mockResolvedValue([]);
  });

  it("includes linked DP transactions and unlinked rows with the same customer name", async () => {
    const response = await GET(
      new Request("http://localhost/api/customers/customer-1/dp-transactions"),
      { params: Promise.resolve({ id: "customer-1" }) },
    );

    expect(response.status).toBe(200);
    expect(transactionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId: "store-main",
          OR: [
            { status: "DP" },
            { status: "COMPLETED", paymentMethod: "TEMPO" },
            {
              status: "COMPLETED",
              debtPaymentLogs: { some: { customerId: "customer-1" } },
            },
          ],
          AND: [
            {
              OR: [
                { customerId: "customer-1" },
                {
                  customerId: null,
                  customerName: {
                    equals: "Agen Sabar Subur",
                    mode: "insensitive",
                  },
                },
              ],
            },
          ],
        },
      }),
    );
  });

  it("returns 404 when the customer is not in the current store", async () => {
    customerFindFirstMock.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/customers/customer-1/dp-transactions"),
      { params: Promise.resolve({ id: "customer-1" }) },
    );

    expect(response.status).toBe(404);
    expect(transactionFindManyMock).not.toHaveBeenCalled();
  });

  it("rejects receivable history when receivable viewing is denied", async () => {
    requirePermissionMock.mockImplementation(async (target: string) => {
      if (target === "customer.receivable") throw new Error("Forbidden");
      return { id: "user-1", role: "SALES", storeId: "store-main" };
    });
    handleAuthErrorMock.mockReturnValue(new Response(null, { status: 403 }));
    const response = await GET(new Request("http://localhost/api/customers/customer-1/dp-transactions"), { params: Promise.resolve({ id: "customer-1" }) });
    expect(response.status).toBe(403);
    expect(transactionFindManyMock).not.toHaveBeenCalled();
  });

  it("does not expose invoice item details without transaction-read access", async () => {
    canPerformMock.mockResolvedValue(false);
    transactionFindManyMock.mockResolvedValue([{ id: "invoice-1", items: [{ productName: "Private item" }] }]);
    const response = await GET(new Request("http://localhost/api/customers/customer-1/dp-transactions"), { params: Promise.resolve({ id: "customer-1" }) });
    expect(response.status).toBe(200);
    expect((await response.json())[0].items).toEqual([]);
  });
});
