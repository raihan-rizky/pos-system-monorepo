import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const expenseFindManyMock = vi.hoisted(() => vi.fn());
const expenseCountMock = vi.hoisted(() => vi.fn());
const expenseCreateMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    expense: {
      findMany: expenseFindManyMock,
      count: expenseCountMock,
      create: expenseCreateMock,
    },
    transaction: {
      findFirst: transactionFindFirstMock,
    },
  },
}));

describe("finance expenses routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    handleAuthErrorMock.mockReturnValue(null);
    expenseFindManyMock.mockResolvedValue([]);
    expenseCountMock.mockResolvedValue(0);
    expenseCreateMock.mockResolvedValue({
      id: "expense-1",
      applicantName: "Ada",
      category: "SUPPLIES",
      description: null,
      amount: { toString: () => "10000" },
      changeAmount: { toString: () => "0" },
      occurredAt: new Date("2026-06-01T00:00:00.000Z"),
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      transactionId: null,
      attachmentUrl: null,
    });
  });

  it("scopes list queries to expenses recorded by users in the current store", async () => {
    const response = await GET(
      new Request("http://localhost/api/finance/expenses?month=2026-06"),
    );

    expect(response.status).toBe(200);
    expect(expenseFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recordedBy: { storeId: "store-1" },
          deletedAt: null,
        }),
      }),
    );
    expect(expenseCountMock).toHaveBeenCalledWith({
      where: expect.objectContaining({
        recordedBy: { storeId: "store-1" },
      }),
    });
  });

  it("rejects linked transactions from another store", async () => {
    transactionFindFirstMock.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/finance/expenses", {
        method: "POST",
        body: JSON.stringify({
          applicantName: "Ada",
          category: "SUPPLIES",
          amount: 10000,
          changeAmount: 0,
          occurredAt: "2026-06-01",
          transactionId: "tx-other-store",
        }),
      }),
    );

    expect(response.status).toBe(422);
    expect(transactionFindFirstMock).toHaveBeenCalledWith({
      where: { id: "tx-other-store", storeId: "store-1" },
      select: { id: true },
    });
    expect(expenseCreateMock).not.toHaveBeenCalled();
  });
});
