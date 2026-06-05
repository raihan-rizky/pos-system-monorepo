import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const customerFindFirstMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
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
          status: "DP",
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
});
