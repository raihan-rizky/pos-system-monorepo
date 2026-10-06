import { describe, expect, it } from "vitest";
import {
  estimateServerNow,
  formatInvoiceWib,
  isTrustedServerClockSource,
  readServerClockSyncMetadata,
  toJakartaInputParts,
} from "../server-clock";

describe("server-clock", () => {
  it("estimates elapsed server time from a monotonic clock and crosses Jakarta midnight", () => {
    const anchor = {
      serverEpochMs: Date.parse("2026-10-05T17:00:00.000Z"),
      receivedMonotonicMs: 1000,
    };

    const now = estimateServerNow(anchor, 301000);

    expect(now.toISOString()).toBe("2026-10-05T17:05:00.000Z");
    expect(toJakartaInputParts(now)).toEqual({
      date: "2026-10-06",
      time: "00:05",
    });
  });

  it("does not move backward when the monotonic reading is older than its anchor", () => {
    const anchor = {
      serverEpochMs: Date.parse("2026-10-05T17:00:00.000Z"),
      receivedMonotonicMs: 1000,
    };

    expect(estimateServerNow(anchor, 500).toISOString()).toBe(
      "2026-10-05T17:00:00.000Z",
    );
  });

  it("formats the timestamp in Jakarta time regardless of the host timezone", () => {
    expect(formatInvoiceWib("2026-10-05T17:05:00.000Z")).toBe(
      "6 Oktober 2026 pukul 00.05 WIB",
    );
  });

  it("preserves the external clock source and last successful synchronization", () => {
    expect(
      readServerClockSyncMetadata({
        source: "TIMEAPI_IO_CACHE",
        lastSyncedAt: 1791231881000,
      }),
    ).toEqual({ source: "TIMEAPI_IO_CACHE", lastSyncedAt: 1791231881000 });
  });

  it("marks invalid or missing synchronization metadata as a server fallback", () => {
    expect(
      readServerClockSyncMetadata({
        source: "UNKNOWN",
        lastSyncedAt: "yesterday",
      }),
    ).toEqual({ source: "SERVER_FALLBACK", lastSyncedAt: null });
  });

  it("keeps Internet and server readings eligible for offline event timestamps", () => {
    expect(isTrustedServerClockSource("TIMEAPI_IO")).toBe(true);
    expect(isTrustedServerClockSource("TIMEAPI_IO_CACHE")).toBe(true);
    expect(isTrustedServerClockSource("TIMEAPI_IO_STALE")).toBe(true);
    expect(isTrustedServerClockSource("SERVER_FALLBACK")).toBe(true);
    expect(isTrustedServerClockSource("SERVER_ESTIMATE")).toBe(true);
    expect(isTrustedServerClockSource("DEVICE_UNVERIFIED")).toBe(false);
  });
});
