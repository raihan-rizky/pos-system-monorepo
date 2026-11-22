import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const expenseFindManyMock = vi.hoisted(() => vi.fn());
const expenseCountMock = vi.hoisted(() => vi.fn());
const expenseCreateMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const recognizedMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/keuangan/services/recognized-finance", () => ({ loadRecognizedExpenses: recognizedMock }));

vi.mock("@/lib/rbac/guard", () => ({
  requireRole: requirePermissionMock, requirePermission: requirePermissionMock,
  canAuthenticatedUserAccessPage: async () => true,
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
    recognizedMock.mockResolvedValue({ rows: [], incomplete: false });
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
    expect(recognizedMock).toHaveBeenCalledWith("store-1", "2026-06");
  });

  it("prefers the goods-purchase source over its shopping request", async () => {
    recognizedMock.mockResolvedValueOnce({ incomplete: false, rows: [
      {
        id: "expense-auto",
        applicantName: "CV Kertas",
        category: "SUPPLIES",
        description: "Permohonan Belanja DPB-202607-001 - 2 item",
        amount: 42500,
        changeAmount: 0,
        netAmount: 42500,
        occurredAt: "2026-07-02T03:15:00.000Z",
        createdAt: "2026-07-19T01:00:00.000Z",
        transactionId: null,
        attachmentUrl: null,
        hasMissingCostSnapshot: true,
        source: { type: "GOODS_PURCHASE", id: "purchase-1", number: "PB-202607-001" },
        recordedBy: { id: "owner-1", name: "Owner" },
      },
    ] });

    const response = await GET(
      new Request("http://localhost/api/finance/expenses?month=2026-07"),
    );
    const body = await response.json();

    expect(body.data[0]).toEqual(
      expect.objectContaining({
        source: {
          type: "GOODS_PURCHASE",
          id: "purchase-1",
          number: "PB-202607-001",
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
