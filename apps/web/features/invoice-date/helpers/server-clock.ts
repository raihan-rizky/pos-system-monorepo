export interface ClockAnchor {
  serverEpochMs: number;
  receivedMonotonicMs: number;
}

export type ServerClockSource =
  | "TIMEAPI_IO"
  | "TIMEAPI_IO_CACHE"
  | "TIMEAPI_IO_STALE"
  | "SERVER_FALLBACK"
  | "SERVER_ESTIMATE"
  | "DEVICE_UNVERIFIED";

export interface ServerClockSyncMetadata {
  source: ServerClockSource;
  lastSyncedAt: number | null;
}

const timeApiSources = new Set<ServerClockSource>([
  "TIMEAPI_IO",
  "TIMEAPI_IO_CACHE",
  "TIMEAPI_IO_STALE",
]);

export function readServerClockSyncMetadata(
  payload: unknown,
): ServerClockSyncMetadata {
  if (!payload || typeof payload !== "object") {
    return { source: "SERVER_FALLBACK", lastSyncedAt: null };
  }

  const metadata = payload as Record<string, unknown>;
  const source = metadata.source;
  const lastSyncedAt = metadata.lastSyncedAt;
  if (
    typeof source !== "string" ||
    ![
      "TIMEAPI_IO",
      "TIMEAPI_IO_CACHE",
      "TIMEAPI_IO_STALE",
      "SERVER_FALLBACK",
    ].includes(source) ||
    (timeApiSources.has(source as ServerClockSource) &&
      (typeof lastSyncedAt !== "number" || !Number.isFinite(lastSyncedAt)))
  ) {
    return { source: "SERVER_FALLBACK", lastSyncedAt: null };
  }

  return {
    source: source as ServerClockSource,
    lastSyncedAt:
      typeof lastSyncedAt === "number" && Number.isFinite(lastSyncedAt)
        ? lastSyncedAt
        : null,
  };
}

export function isTrustedServerClockSource(source: unknown): boolean {
  return (
    source === "SERVER" ||
    source === "SERVER_ESTIMATE" ||
    source === "SERVER_FALLBACK" ||
    timeApiSources.has(source as ServerClockSource)
  );
}

export interface JakartaInputParts {
  date: string;
  time: string;
}

const inputPartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const invoiceDateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const invoiceTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function estimateServerNow(
  anchor: ClockAnchor,
  monotonicMs: number,
): Date {
  return new Date(
    anchor.serverEpochMs + Math.max(0, monotonicMs - anchor.receivedMonotonicMs),
  );
}

export function toJakartaInputParts(date: Date): JakartaInputParts {
  const parts = Object.fromEntries(
    inputPartsFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function formatInvoiceWib(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "-";
  const day = invoiceDateFormatter.format(value);
  const time = invoiceTimeFormatter.format(value).replace(":", ".");
  return `${day} pukul ${time} WIB`;
}
