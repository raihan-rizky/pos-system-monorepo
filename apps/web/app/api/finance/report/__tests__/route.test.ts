import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const cashierShiftFindManyMock = vi.hoisted(() => vi.fn());
const inventoryLogFindManyMock = vi.hoisted(() => vi.fn());
const expenseAggregateMock = vi.hoisted(() => vi.fn());
const expenseCountMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    transaction: {
      findMany: transactionFindManyMock,
    },
    cashierShift: {
      findMany: cashierShiftFindManyMock,
    },
    inventoryLog: {
      findMany: inventoryLogFindManyMock,
    },
    expense: {
      aggregate: expenseAggregateMock,
      count: expenseCountMock,
    },
  },
}));

describe("GET /api/finance/report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    transactionFindManyMock.mockResolvedValue([]);
    cashierShiftFindManyMock.mockResolvedValue([]);
    inventoryLogFindManyMock.mockResolvedValue([]);
    expenseAggregateMock.mockResolvedValue({
      _sum: { amount: null, changeAmount: null },
      _count: { _all: 0 },
    });
    expenseCountMock.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires financial-report read permission", async () => {
    const request = new NextRequest(
      "http://localhost/api/finance/report?dateFrom=2026-05-01&dateTo=2026-05-31",
    );

    await GET(request);

    expect(requirePermissionMock).toHaveBeenCalledWith("financial-report", "read");
  });

  it("queries confirmed sales by invoiceDate and shifts within the requested Jakarta date range", async () => {
    const request = new NextRequest(
      "http://localhost/api/finance/report?dateFrom=2026-05-01&dateTo=2026-05-31",
    );

    const response = await GET(request);
    expect(response.status).toBe(200);

    expect(transactionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-main",
          status: { in: ["COMPLETED", "DP"] },
          invoiceDate: {
            gte: new Date("2026-04-30T17:00:00.000Z"),
            lt: new Date("2026-05-31T17:00:00.000Z"),
          },
        }),
      }),
    );
    expect(cashierShiftFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-main",
          openedAt: {
            gte: new Date("2026-04-30T17:00:00.000Z"),
            lt: new Date("2026-05-31T17:00:00.000Z"),
          },
        }),
      }),
    );
  });

  it("aggregates store expenses and exposes expense and estimated-net-profit KPIs", async () => {
    expenseAggregateMock.mockResolvedValue({
      _sum: {
        amount: { toString: () => "35000.00" },
        changeAmount: { toString: () => "5000.00" },
      },
      _count: { _all: 2 },
    });
    expenseCountMock.mockResolvedValue(1);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/finance/report?dateFrom=2026-05-01&dateTo=2026-05-31",
      ),
    );
    const body = await response.json();

    expect(expenseAggregateMock).toHaveBeenCalledWith({
      where: {
        storeId: "store-main",
        deletedAt: null,
        occurredAt: {
          gte: new Date("2026-04-30T17:00:00.000Z"),
          lt: new Date("2026-05-31T17:00:00.000Z"),
        },
      },
      _sum: { amount: true, changeAmount: true },
      _count: { _all: true },
    });
    expect(expenseCountMock).toHaveBeenCalledWith({
      where: expect.objectContaining({
        storeId: "store-main",
        hasMissingCostSnapshot: true,
      }),
    });
    expect(body.summary.expenseTotal).toBe(30000);
    expect(body.summary.expenseEntryCount).toBe(2);
    expect(body.summary.incompleteExpenseCount).toBe(1);
    expect(body.summary.estimatedNetProfit).toBe(-30000);
  });

  it("rejects invalid date ranges before querying the database", async () => {
    const invalidDate = new NextRequest(
      "http://localhost/api/finance/report?dateFrom=not-a-date&dateTo=2026-05-31",
    );
    const reversedRange = new NextRequest(
      "http://localhost/api/finance/report?dateFrom=2026-06-01&dateTo=2026-05-31",
    );

    const invalidResponse = await GET(invalidDate);
    const reversedResponse = await GET(reversedRange);

    expect(invalidResponse.status).toBe(422);
    expect(reversedResponse.status).toBe(422);
    expect(transactionFindManyMock).not.toHaveBeenCalled();
    expect(cashierShiftFindManyMock).not.toHaveBeenCalled();

    const body = await invalidResponse.json();
    expect(body.code).toBe("ValidationError");
  });

  it("rejects date ranges exceeding the 366-day cap", async () => {
    const request = new NextRequest(
      "http://localhost/api/finance/report?dateFrom=2024-01-01&dateTo=2026-05-31",
    );
    const response = await GET(request);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe("ValidationError");
    expect(body.message).toContain("366");
    expect(transactionFindManyMock).not.toHaveBeenCalled();
  });

  it("queries inventoryLog by store, date range, and loss reasons including null", async () => {
    const request = new NextRequest(
      "http://localhost/api/finance/report?dateFrom=2026-05-01&dateTo=2026-05-31",
    );

    inventoryLogFindManyMock.mockResolvedValue([
      { type: "OUT", reason: "WASTE", quantity: 2, unitCost: "5000" },
    ]);

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(inventoryLogFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          product: { storeId: "store-main" },
          createdAt: {
            gte: new Date("2026-04-30T17:00:00.000Z"),
            lt: new Date("2026-05-31T17:00:00.000Z"),
          },
          OR: [
            { reason: { in: ["WASTE", "USAGE", "OPNAME", "MANUAL_ADJUSTMENT"] } },
            { reason: null },
          ],
        }),
      }),
    );
    expect(body.summary.lossStokNet).toBe(10000);
    expect(body.lossStok).toEqual([
      { reason: "WASTE", netValue: 10000, netQuantity: 2, entryCount: 1 },
    ]);
  });

  it("defaults to the current Jakarta month when dates are omitted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T03:30:00.000Z"));

    const request = new NextRequest("http://localhost/api/finance/report");

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.dateFrom).toBe("2026-05-01");
    expect(json.dateTo).toBe("2026-05-20");
    expect(transactionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoiceDate: {
            gte: new Date("2026-04-30T17:00:00.000Z"),
            lt: new Date("2026-05-20T17:00:00.000Z"),
          },
        }),
      }),
    );
  });
});
