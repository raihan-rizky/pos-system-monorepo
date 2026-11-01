import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const shiftFindFirstMock = vi.hoisted(() => vi.fn());
const shiftUpdateManyMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
    cashierShift: {
      findFirst: shiftFindFirstMock,
      updateMany: shiftUpdateManyMock,
    },
    transaction: {
      findMany: transactionFindManyMock,
      findFirst: transactionFindFirstMock,
    },
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/shifts/close", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/shifts/close", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({ id: "cashier-1", storeId: "store-main" });
    handleAuthErrorMock.mockReturnValue(null);
    shiftFindFirstMock.mockResolvedValue({
      id: "shift-1",
      storeId: "store-main",
      status: "OPEN",
      openedAt: new Date("2026-06-22T00:00:00Z"),
      openingBalance: 100000,
      note: null,
    });
    transactionFindManyMock.mockResolvedValue([
      { total: 50000, amountPaid: 50000, status: "COMPLETED" },
    ]);
    transactionFindFirstMock.mockResolvedValue(null);
    shiftUpdateManyMock.mockReset().mockResolvedValue({ count: 1 });
    dbTransactionMock.mockImplementation(async (callback) => callback({
      cashierShift: { findFirst: shiftFindFirstMock, updateMany: shiftUpdateManyMock },
      transaction: { findMany: transactionFindManyMock, findFirst: transactionFindFirstMock },
    }));
  });

  it("closes an open shift with a status-guarded write", async () => {
    const response = await POST(
      makeRequest({ shiftId: "shift-1", closingBalance: 150000 }),
    );

    expect(response.status).toBe(200);
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(shiftUpdateManyMock).toHaveBeenCalledTimes(2);
    expect(shiftUpdateManyMock.mock.calls[0][0].data).toEqual({ pausedDurationSeconds: { increment: 0 } });
    const args = shiftUpdateManyMock.mock.calls[1][0];
    expect(args.where).toMatchObject({
      id: "shift-1",
      storeId: "store-main",
      status: "OPEN",
    });
    expect(args.data).toMatchObject({
      closingBalance: 150000,
      expectedBalance: 150000,
      discrepancy: 0,
      status: "CLOSED",
    });
  });

  it("returns 409 when the shift was already closed by a concurrent request", async () => {
    // Both requests passed the OPEN read; the guarded write loses the race.
    shiftUpdateManyMock.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const response = await POST(
      makeRequest({ shiftId: "shift-1", closingBalance: 150000 }),
    );

    expect(response.status).toBe(409);
  });

  it("includes the cash portion of split payments and subtracts change", async () => {
    transactionFindManyMock.mockResolvedValue([
      { paymentMethod: "DEBIT", total: 50000, amountPaid: 60000, change: 10000, status: "COMPLETED", payments: [
        { method: "DEBIT", amount: 40000 }, { method: "CASH", amount: 20000 },
      ] },
      { paymentMethod: "CASH", total: 50000, amountPaid: 20000, change: 0, status: "DP", payments: [] },
    ]);
    const response = await POST(makeRequest({ shiftId: "shift-1", closingBalance: 130000 }));
    expect(response.status).toBe(200);
    expect(shiftUpdateManyMock.mock.calls[1][0].data).toMatchObject({ expectedBalance: 130000, discrepancy: 0 });
    expect(transactionFindManyMock.mock.calls[0][0].where).not.toHaveProperty("paymentMethod", "CASH");
  });

  it("returns an already committed close when the matching response was lost", async () => {
    const closedAt = "2026-06-22T05:00:00.000Z";
    shiftUpdateManyMock.mockResolvedValueOnce({ count: 0 });
    shiftFindFirstMock.mockResolvedValueOnce({
      id: "shift-1", cashierId: "cashier-1", storeId: "store-main", status: "CLOSED",
      closingBalance: 150000, closedAt: new Date(closedAt),
    });
    const response = await POST(makeRequest({ shiftId: "shift-1", closingBalance: 150000, closedAt }));
    expect(response.status).toBe(200);
    expect(shiftUpdateManyMock).toHaveBeenCalledTimes(1);
  });

  it("limits an offline shift summary to sales before its recorded closing time", async () => {
    shiftFindFirstMock.mockResolvedValue({
      id: "shift-1", cashierId: "cashier-1", storeId: "store-main", status: "OPEN",
      openedAt: new Date("2026-06-22T00:00:00Z"), openingBalance: 100000, note: null,
    });
    const closedAt = "2026-06-22T05:00:00.000Z";
    const response = await POST(makeRequest({ shiftId: "shift-1", closingBalance: 150000, closedAt }));
    expect(response.status).toBe(200);
    expect(transactionFindManyMock.mock.calls[0][0].where.createdAt).toEqual({
      gte: new Date("2026-06-22T00:00:00Z"), lte: new Date(closedAt),
    });
  });

  it("refuses to freeze a shift balance while a captured sale awaits approval", async () => {
    shiftFindFirstMock.mockResolvedValue({
      id: "shift-1", cashierId: "cashier-1", storeId: "store-main", status: "OPEN",
      openedAt: new Date("2026-06-22T00:00:00Z"), openingBalance: 100000, note: null,
    });
    transactionFindFirstMock.mockResolvedValue({ id: "pending-sale" });
    const closedAt = "2026-06-22T05:00:00.000Z";
    const response = await POST(makeRequest({ shiftId: "shift-1", closingBalance: 150000, closedAt }));
    expect(response.status).toBe(409);
    expect((await response.json()).message).toMatch(/approval/i);
    expect(shiftUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(transactionFindFirstMock.mock.calls[0][0].where).toMatchObject({
      storeId: "store-main", status: "PENDING_APPROVAL", offlineClientMutationId: { not: null },
      createdAt: { gte: new Date("2026-06-22T00:00:00Z"), lte: new Date(closedAt) },
    });
  });
});
