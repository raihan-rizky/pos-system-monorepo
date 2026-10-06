import { getLogger } from "@/lib/logger";
const log = getLogger("server:internet-clock");
const TIME_API_URL =
  "https://timeapi.io/api/Time/current/zone?timeZone=UTC";
const TIME_API_TIMEOUT_MS = 2_000;
const TIME_API_CACHE_MS = 60_000;

interface OnlineClockSample {
  serverEpochMs: number;
  sampledAtMonotonicMs: number;
  lastSyncedAt: number;
}

let onlineClockSample: OnlineClockSample | null = null;

function readUtcEpochMs(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    throw new Error("Respons sumber waktu tidak valid");
  }

  const data = payload as Record<string, unknown>;
  if (data.timeZone !== "UTC" || typeof data.dateTime !== "string") {
    throw new Error("Respons sumber waktu tidak valid");
  }

  const dateTime = data.dateTime;
  const utcDateTime = /(?:Z|[+-]\d{2}:\d{2})$/i.test(dateTime)
    ? dateTime
    : `${dateTime}Z`;
  const epochMs = Date.parse(utcDateTime);
  if (!Number.isFinite(epochMs)) {
    throw new Error("Sumber waktu mengirim tanggal tidak valid");
  }

  return epochMs;
}

async function readOnlineClock(): Promise<number> {
  const requestStartedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIME_API_TIMEOUT_MS);

  try {
    const response = await fetch(TIME_API_URL, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Sumber waktu merespons ${response.status}`);
    }

    const providerEpochMs = readUtcEpochMs(await response.json());
    const responseReceivedAt = performance.now();
    const requestDurationMs = Math.max(0, responseReceivedAt - requestStartedAt);
    return providerEpochMs + requestDurationMs / 2;
  } finally {
    clearTimeout(timeout);
  }
}

async function readClockReading(): Promise<{
  serverEpochMs: number;
  source: "TIMEAPI_IO" | "TIMEAPI_IO_CACHE" | "TIMEAPI_IO_STALE" | "SERVER_FALLBACK";
  lastSyncedAt: number | null;
}> {
  const monotonicNow = performance.now();
  if (
    onlineClockSample &&
    monotonicNow - onlineClockSample.sampledAtMonotonicMs < TIME_API_CACHE_MS
  ) {
    return {
      serverEpochMs:
        onlineClockSample.serverEpochMs +
        Math.max(0, monotonicNow - onlineClockSample.sampledAtMonotonicMs),
      source: "TIMEAPI_IO_CACHE",
      lastSyncedAt: onlineClockSample.lastSyncedAt,
    };
  }

  try {
    const serverEpochMs = await readOnlineClock();
    const sampledAtMonotonicMs = performance.now();
    onlineClockSample = {
      serverEpochMs,
      sampledAtMonotonicMs,
      lastSyncedAt: serverEpochMs,
    };

    return {
      serverEpochMs,
      source: "TIMEAPI_IO",
      lastSyncedAt: serverEpochMs,
    };
  } catch (error) {
    log.warn("Online clock source is unavailable; using a local fallback.", error);
    if (onlineClockSample) {
      return {
        serverEpochMs:
          onlineClockSample.serverEpochMs +
          Math.max(0, performance.now() - onlineClockSample.sampledAtMonotonicMs),
        source: "TIMEAPI_IO_STALE",
        lastSyncedAt: onlineClockSample.lastSyncedAt,
      };
    }

    return {
      serverEpochMs: Date.now(),
      source: "SERVER_FALLBACK",
      lastSyncedAt: null,
    };
  }
}

let pendingReading: ReturnType<typeof readClockReading> | null = null;
export function getClockReading(): ReturnType<typeof readClockReading> {
  if (!pendingReading) {
    pendingReading = readClockReading().finally(() => { pendingReading = null; });
  }
  return pendingReading;
}
export async function getInvoiceNow(): Promise<Date> {
  return new Date((await getClockReading()).serverEpochMs);
}