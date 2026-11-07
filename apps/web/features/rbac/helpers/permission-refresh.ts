import { ACTIONS, EDITABLE_ROLES, PAGE_TARGETS, RESOURCE_TARGETS, isValidRole } from "./rbac-core";
import type { Role, RolePermissions } from "./rbac-core";

export type CurrentRoleAccess = {
  permissions: RolePermissions;
  authorizationFingerprint: string;
  user: { id: string; name: string; role: Role; storeId: string | null };
};

export class PermissionRefreshError extends Error {
  constructor(public readonly reason: "http" | "invalid", public readonly status?: number) {
    super(reason === "http" ? "Hak akses belum dapat diverifikasi" : "Data hak akses belum lengkap");
    this.name = "PermissionRefreshError";
  }
}

export async function loadCurrentRoleAccess(signal: AbortSignal): Promise<CurrentRoleAccess> {
  const request = new AbortController();
  const abort = () => request.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) request.abort();
  const timeout = setTimeout(abort, 10_000);
  try {
  const response = await fetch("/api/auth/permissions", { cache: "no-store", credentials: "same-origin", signal: request.signal });
  if (!response.ok) throw new PermissionRefreshError("http", response.status);
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new PermissionRefreshError("invalid");
  }
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
        if (typeof data.permissions?.[role]?.resources?.[target]?.[action] !== "boolean") throw new PermissionRefreshError("invalid");
      }
    }
  }
  return data as CurrentRoleAccess;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

export function startPermissionRefresh(
  refresh: (signal: AbortSignal) => Promise<void>,
  options: { onOnline?: () => void } = {},
) {
  const controller = new AbortController();
  let inFlight = false;
  let queued = false;
  const run = async () => {
    if (controller.signal.aborted || document.visibilityState === "hidden") return;
    if (inFlight) { queued = true; return; }
    inFlight = true;
    try { await refresh(controller.signal); } finally {
      inFlight = false;
      if (queued && !controller.signal.aborted) { queued = false; notify(); }
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
  const interval = setInterval(notify, 30_000);
  notify();
  return () => {
    controller.abort();
    clearInterval(interval);
    window.removeEventListener("focus", notify);
    window.removeEventListener("online", online);
    window.removeEventListener("pos:permissions-changed", notify);
    window.removeEventListener("storage", storage);
    document.removeEventListener("visibilitychange", notify);
  };
}
