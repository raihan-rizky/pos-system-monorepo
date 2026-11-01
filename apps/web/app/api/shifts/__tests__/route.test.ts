import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const shiftFindFirstMock = vi.hoisted(() => vi.fn());
const shiftFindManyMock = vi.hoisted(() => vi.fn());
const shiftCountMock = vi.hoisted(() => vi.fn());
const shiftCreateMock = vi.hoisted(() => vi.fn());
const getShiftSettingsMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/shift/shift-settings-server", () => ({
  getShiftSettings: getShiftSettingsMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    cashierShift: {
      findFirst: shiftFindFirstMock,
      findMany: shiftFindManyMock,
      count: shiftCountMock,
      create: shiftCreateMock,
    },
    transaction: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ error: vi.fn() }),
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/shifts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/shifts pause state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "cashier-1",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    shiftFindFirstMock.mockResolvedValue(null);
    shiftFindManyMock.mockResolvedValue([]);
    shiftCountMock.mockResolvedValue(0);
    shiftCreateMock.mockResolvedValue({
      id: "shift-1",
      cashierId: "cashier-1",
      storeId: "store-main",
      openingBalance: 100000,
      closingBalance: null,
      expectedBalance: null,
      discrepancy: null,
      status: "OPEN",
      note: null,
      openedAt: new Date("2026-08-02T10:00:00.000Z"),
      closedAt: null,
      pausedAt: new Date("2026-08-02T10:00:00.000Z"),
      pausedDurationSeconds: 0,
      cashier: { name: "Cashier" },
    });
    getShiftSettingsMock.mockResolvedValue({ enabled: true });
    transactionMock.mockImplementation(async (callback) =>
      callback({
        cashierShift: {
          findFirst: shiftFindFirstMock,
          create: shiftCreateMock,
        },
      }),
    );
  });

  it("serializes paused fields for an active shift", async () => {
    shiftFindFirstMock.mockResolvedValueOnce({
      id: "shift-1",
      cashierId: "cashier-1",
      storeId: "store-main",
      openingBalance: 100000,
      closingBalance: null,
      expectedBalance: null,
      discrepancy: null,
      status: "OPEN",
      note: null,
      openedAt: new Date("2026-08-02T08:00:00.000Z"),
      closedAt: null,
      pausedAt: new Date("2026-08-02T09:00:00.000Z"),
      pausedDurationSeconds: 60,
      cashier: { name: "Cashier" },
    });

    const response = await GET(new Request("http://localhost/api/shifts?active=true"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.pausedAt).toBe("2026-08-02T09:00:00.000Z");
    expect(body.data.pausedDurationSeconds).toBe(60);
  });

  it("starts a new shift paused when shift mode is disabled", async () => {
    getShiftSettingsMock.mockResolvedValue({ enabled: false });

    const response = await POST(makeRequest({ openingBalance: 100000 }));

    expect(response.status).toBe(201);
    expect(getShiftSettingsMock).toHaveBeenCalledTimes(1);
    const createArgs = shiftCreateMock.mock.calls[0][0];
    expect(createArgs.data).toMatchObject({
      status: "OPEN",
      pausedDurationSeconds: 0,
    });
    expect(createArgs.data.pausedAt).toBeInstanceOf(Date);
  });

  it("opens shifts under serializable isolation to prevent concurrent openings", async () => {
    await POST(makeRequest({ openingBalance: 100000 }));
    expect(transactionMock.mock.calls[0][1]).toMatchObject({ isolationLevel: "Serializable" });
  });

  it("returns the cashier's existing shift when the same opening request is retried", async () => {
    shiftFindFirstMock.mockResolvedValueOnce({
      id: "offline-shift-1", cashierId: "cashier-1", storeId: "store-main", status: "OPEN", openingBalance: 100000,
    });
    const response = await POST(makeRequest({ openingBalance: 100000, clientShiftId: "offline-shift-1" }));
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe("offline-shift-1");
    expect(shiftCreateMock).not.toHaveBeenCalled();
  });

  it("preserves the opening time of an offline shift during replay", async () => {
    const openedAt = "2026-09-01T08:00:00.000Z";
    const response = await POST(makeRequest({ openingBalance: 100000, clientShiftId: "offline-shift-1", openedAt,
      originCashierId: "cashier-1", originStoreId: "store-main" }));
    expect(response.status).toBe(201);
    expect(shiftCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ id: "offline-shift-1", openedAt: new Date(openedAt) }),
    }));
  });

  it("rejects an offline shift that would overlap a shift already recorded on the server", async () => {
    shiftFindFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "other-shift", status: "CLOSED" });
    const response = await POST(makeRequest({ openingBalance: 100000, clientShiftId: "offline-shift-1", openedAt: "2026-09-01T08:00:00.000Z",
      originCashierId: "cashier-1", originStoreId: "store-main" }));
    expect(response.status).toBe(409);
    expect((await response.json()).message).toContain("waktu shift lain");
    expect(shiftCreateMock).not.toHaveBeenCalled();
  });

  it("does not accept an offline opening time without an idempotency key", async () => {
    const response = await POST(makeRequest({ openingBalance: 100000, openedAt: "2026-09-01T08:00:00.000Z" }));
    expect(response.status).toBe(422);
    expect(shiftCreateMock).not.toHaveBeenCalled();
  });

  it.each([
    { originCashierId: "cashier-2", originStoreId: "store-main" },
    { originCashierId: "cashier-1", originStoreId: "store-2" },
  ])("rejects a shift opening when the session differs from the originating identity: %o", async (origin) => {
    const response = await POST(makeRequest({
      openingBalance: 100000, clientShiftId: "offline-shift-1",
      openedAt: "2026-09-01T08:00:00.000Z", ...origin,
    }));
    expect(response.status).toBe(403);
    expect(shiftCreateMock).not.toHaveBeenCalled();
  });

  it("requires the originating identity for an offline shift replay", async () => {
    const response = await POST(makeRequest({
      openingBalance: 100000, clientShiftId: "offline-shift-1", openedAt: "2026-09-01T08:00:00.000Z",
    }));
    expect(response.status).toBe(422);
    expect(shiftCreateMock).not.toHaveBeenCalled();
  });
});
