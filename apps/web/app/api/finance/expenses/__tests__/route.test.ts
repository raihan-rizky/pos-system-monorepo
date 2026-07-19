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

  it("scopes list queries directly to the current store", async () => {
    const response = await GET(
      new Request("http://localhost/api/finance/expenses?month=2026-06"),
    );

    expect(response.status).toBe(200);
    expect(expenseFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-1",
          deletedAt: null,
        }),
      }),
    );
    expect(expenseCountMock).toHaveBeenCalledWith({
      where: expect.objectContaining({
        storeId: "store-1",
      }),
    });
  });

  it("returns a distinct shopping-request source and missing-cost warning", async () => {
    expenseFindManyMock.mockResolvedValueOnce([
      {
        id: "expense-auto",
        applicantName: "CV Kertas",
        category: "SUPPLIES",
        description: "Permohonan Belanja DPB-202607-001 - 2 item",
        amount: { toString: () => "42500.00" },
        changeAmount: { toString: () => "0.00" },
        occurredAt: new Date("2026-07-02T03:15:00.000Z"),
        createdAt: new Date("2026-07-19T01:00:00.000Z"),
        transactionId: null,
        attachmentUrl: null,
        hasMissingCostSnapshot: true,
        shoppingRequest: { id: "request-1", number: "DPB-202607-001" },
        recordedBy: { id: "owner-1", name: "Owner" },
      },
    ]);
    expenseCountMock.mockResolvedValueOnce(1);

    const response = await GET(
      new Request("http://localhost/api/finance/expenses?month=2026-07"),
    );
    const body = await response.json();

    expect(body.data[0]).toEqual(
      expect.objectContaining({
        source: {
          type: "SHOPPING_REQUEST",
          id: "request-1",
          number: "DPB-202607-001",
        },
        hasMissingCostSnapshot: true,
      }),
    );
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
