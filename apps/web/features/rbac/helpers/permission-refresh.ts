import { ACTIONS, EDITABLE_ROLES, PAGE_TARGETS, RESOURCE_TARGETS, isValidRole } from "./rbac-core";
import type { Role, RolePermissions } from "./rbac-core";
import { parseRetryAfter, type SessionFailureKind } from "@/lib/auth/session-failure";

export type CurrentRoleAccess = {
  permissions: RolePermissions;
  authorizationFingerprint: string;
  user: { id: string; name: string; role: Role; storeId: string | null };
};

export class PermissionRefreshError extends Error {
  readonly kind: SessionFailureKind;
  private readonly retryAt: number;

  constructor(
    public readonly reason: "http" | "invalid",
    public readonly status?: number,
    options: { kind?: SessionFailureKind; retryAfterMs?: number } = {},
  ) {
    super(reason === "http" ? "Hak akses belum dapat diverifikasi" : "Data hak akses belum lengkap");
    this.name = "PermissionRefreshError";
    this.kind = options.kind ?? (
      status === 401 ? "unauthenticated" :
      status === 403 ? "forbidden" :
      status === 409 || status === 429 || (status !== undefined && status >= 500) ? "transient" : "invalid"
    );
    this.retryAt = Date.now() + (options.retryAfterMs ?? 0);
  }

  get retryAfterMs() {
    return Math.max(0, this.retryAt - Date.now());
  }
}

function canCheckPermissions() {
  return (typeof document === "undefined" || document.visibilityState !== "hidden")
    && (typeof navigator === "undefined" || navigator.onLine !== false);
}

function jitter(baseMs: number, range: number) {
  return Math.round(baseMs * (1 + (2 * Math.random() - 1) * range));
}

function waitForRetry(delay: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, delay);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

async function fetchPermissionSnapshot(signal: AbortSignal): Promise<CurrentRoleAccess> {
  signal.throwIfAborted();
  const request = new AbortController();
  const abort = () => request.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 10_000);
  try {
    const response = await fetch("/api/auth/permissions", { cache: "no-store", credentials: "same-origin", signal: request.signal })
      .catch(() => { throw new PermissionRefreshError("http", undefined, { kind: "transient" }); });
    if (!response.ok) {
      throw new PermissionRefreshError("http", response.status, {
        retryAfterMs: parseRetryAfter(response.headers.get("Retry-After")),
      });
    }
    const data: Partial<CurrentRoleAccess> | null = await response.json().catch(() => {
      if (request.signal.aborted) throw new PermissionRefreshError("http", undefined, { kind: "transient" });
      throw new PermissionRefreshError("invalid");
    });
    if (!data?.user || typeof data.user.id !== "string" || typeof data.user.name !== "string" ||
        !isValidRole(data.user.role) || (data.user.storeId !== null && typeof data.user.storeId !== "string") ||
        typeof data.authorizationFingerprint !== "string" || !data.authorizationFingerprint) {
      throw new PermissionRefreshError("invalid");
    }
    for (const role of EDITABLE_ROLES) {
      for (const page of PAGE_TARGETS) {
        if (typeof data.permissions?.[role]?.pages?.[page] !== "boolean") throw new PermissionRefreshError("invalid");
      }
      for (const target of RESOURCE_TARGETS) {
        for (const action of ACTIONS) {
          if (typeof data.permissions?.[role]?.resources?.[target]?.[action] !== "boolean") {
            throw new PermissionRefreshError("invalid");
          }
        }
      }
    }
    signal.throwIfAborted();
    return data as CurrentRoleAccess;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

export async function loadCurrentRoleAccess(
  signal: AbortSignal,
  options: { onRetrying?: (error: PermissionRefreshError) => void } = {},
): Promise<CurrentRoleAccess> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchPermissionSnapshot(signal);
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof PermissionRefreshError) || error.kind !== "transient" || attempt === 3 || !canCheckPermissions()) {
        throw error;
      }
      options.onRetrying?.(error);
      await waitForRetry(Math.max(jitter(attempt * 1_000, 0.2), error.retryAfterMs), signal);
      if (!canCheckPermissions()) throw error;
    }
  }
}

export function startPermissionRefresh(
  refresh: (signal: AbortSignal) => Promise<void>,
  options: { onOnline?: () => void } = {},
) {
  const controller = new AbortController();
  let inFlight = false;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryAt = 0;
  const schedule = (delay: number) => {
    clearTimeout(timer);
    timer = setTimeout(notify, delay);
  };
  const run = async () => {
    if (controller.signal.aborted || !canCheckPermissions()) return;
    if (inFlight) { queued = true; return; }
    const remaining = retryAt - Date.now();
    if (remaining > 0) {
      schedule(remaining);
      return;
    }
    clearTimeout(timer);
    inFlight = true;
    queued = false;
    try {
      const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
      if (locks) {
        // Tabs for the same site share auth cookies and can otherwise all refresh at once.
        await locks.request("pos:permission-check", { ifAvailable: true }, async lock => {
          if (lock && !controller.signal.aborted && canCheckPermissions()) await refresh(controller.signal);
        });
      } else {
        await refresh(controller.signal);
      }
    } catch (error) {
      if (error instanceof PermissionRefreshError) retryAt = Date.now() + error.retryAfterMs;
    } finally {
      inFlight = false;
      if (!controller.signal.aborted) {
        if (queued) notify();
        else schedule(jitter(30_000, 0.1));
      }
    }
  };
  const notify = () => { void run().catch(() => undefined); };
  const online = () => { try { options.onOnline?.(); } finally { notify(); } };
  const storage = (event: StorageEvent) => { if (event.key === "pos:permissions-version") notify(); };
  window.addEventListener("focus", notify);
  window.addEventListener("online", online);
  window.addEventListener("pos:permissions-changed", notify);
  window.addEventListener("storage", storage);
  document.addEventListener("visibilitychange", notify);
  notify();
  return () => {
    controller.abort();
    clearTimeout(timer);
    window.removeEventListener("focus", notify);
    window.removeEventListener("online", online);
    window.removeEventListener("pos:permissions-changed", notify);
    window.removeEventListener("storage", storage);
    document.removeEventListener("visibilitychange", notify);
  };
}
