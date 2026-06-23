import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const shiftFindFirstMock = vi.hoisted(() => vi.fn());
const shiftUpdateManyMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    cashierShift: {
      findFirst: shiftFindFirstMock,
      updateMany: shiftUpdateManyMock,
    },
    transaction: {
      findMany: transactionFindManyMock,
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
    shiftUpdateManyMock.mockResolvedValue({ count: 1 });
  });

  it("closes an open shift with a status-guarded write", async () => {
    const response = await POST(
      makeRequest({ shiftId: "shift-1", closingBalance: 150000 }),
    );

    expect(response.status).toBe(200);
    expect(shiftUpdateManyMock).toHaveBeenCalledTimes(1);
    const args = shiftUpdateManyMock.mock.calls[0][0];
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
    shiftUpdateManyMock.mockResolvedValue({ count: 0 });

    const response = await POST(
      makeRequest({ shiftId: "shift-1", closingBalance: 150000 }),
    );

    expect(response.status).toBe(409);
  });
});
