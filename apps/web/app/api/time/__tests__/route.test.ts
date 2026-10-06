import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requireRole: requireRoleMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ error: loggerErrorMock, warn: loggerErrorMock }),
}));

describe("GET /api/time", () => {
  let getTime: typeof import("../route").GET;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue(undefined);
    handleAuthErrorMock.mockReturnValue(null);
    getTime = (await import("../route")).GET;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns a TimeAPI UTC sample and its last synchronization time", async () => {
    const sampledAt = Date.parse("2026-10-05T20:24:41.000Z");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        dateTime: "2026-10-05T20:24:41.000",
        timeZone: "UTC",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getTime();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        serverEpochMs: expect.any(Number),
        timeZone: "Asia/Jakarta",
        source: "TIMEAPI_IO",
        lastSyncedAt: expect.any(Number),
      }),
    );
    expect(body.lastSyncedAt).toBeGreaterThanOrEqual(sampledAt);
    expect(body.serverEpochMs).toBeGreaterThanOrEqual(body.lastSyncedAt);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://timeapi.io/api/Time/current/zone?timeZone=UTC",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("reuses a recent online sample and reports that it came from cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        dateTime: "2026-10-05T20:24:41.000",
        timeZone: "UTC",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getTime();
    const response = await getTime();
    const body = await response.json();

    expect(body.source).toBe("TIMEAPI_IO_CACHE");
    expect(body.lastSyncedAt).toEqual(expect.any(Number));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("identifies the local server fallback when the online source is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const now = Date.now();

    const response = await getTime();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe("SERVER_FALLBACK");
    expect(body.lastSyncedAt).toBeNull();
    expect(body.serverEpochMs).toBeGreaterThanOrEqual(now);
  });

  it("shares an in-flight synchronization across simultaneous callers", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({ dateTime: "2026-10-05T20:24:41.000", timeZone: "UTC" }));
    vi.stubGlobal("fetch", fetchMock);
    const [first, second] = await Promise.all([getTime(), getTime()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts a hanging online-time request within the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = getTime();
    await vi.advanceTimersByTimeAsync(2_000);
    const response = await pending;
    const body = await response.json();

    expect(body.source).toBe("SERVER_FALLBACK");
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
