"use client";

import React, { createContext, useContext, useCallback, useMemo, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/rbac/permissions";
import { Action } from "@/lib/rbac/permissions";
import {
  buildDefaultRolePermissions,
  canRoleAccessPage,
  canRolePerformAction,
} from "@/features/rbac/helpers/rbac-core";
import type { RolePermissions } from "@/features/rbac/helpers/rbac-core";
import { loadCurrentRoleAccess, PermissionRefreshError, startPermissionRefresh, type CurrentRoleAccess } from "@/features/rbac/helpers/permission-refresh";
import { createOnlineAccessState, reduceOnlineAccessState, type OnlineAccessEvent, type OnlineAccessPhase } from "@/features/rbac/helpers/online-access-state";
import { AccessStatus } from "@/features/rbac/components/AccessStatus";
import { POS_SESSION_ENDED_EVENT } from "@/lib/auth/pos-session";
import { invalidateOfflineAccess, isCurrentOfflineAuthorization, OFFLINE_REVOCATION_CHANNEL, offlineRevocationKey, offlineRevocationMatches } from "@/public/offline-vault.mjs";

interface RoleContextType {
  role: Role | null;
  userId: string | null;
  userName: string | null;
  storeId: string | null;
  authorizationFingerprint: string | null;
  isOfflineSession: boolean;
  isSessionRecovering: boolean;
  canAccess: (path: string) => boolean;
  canPerform: (resource: string, action: Action) => boolean;
}

const RoleContext = createContext<RoleContextType>({
  role: null,
  userId: null,
  userName: null,
  storeId: null,
  authorizationFingerprint: null,
  isOfflineSession: false,
  isSessionRecovering: false,
  canAccess: () => false,
  canPerform: () => false,
});

export function useRole() {
  return useContext(RoleContext);
}

type OfflineAuthorization = {
  cashierId: string;
  storeId: string;
  role: Role;
  authorizationFingerprint: string;
  revocationMarker: string | null;
  vaultGeneration: string;
  preparedAt: string;
};

type OfflineGuard = {
  has: (cashierId: string, storeId: string) => boolean;
  subscribe: (listener: (cashierId: string, storeId: string) => void) => () => void;
  close: () => void;
};
type OfflineWindow = Window & { __posOfflineAuthorization?: OfflineAuthorization; __posOfflineRevocationGuard?: OfflineGuard };
type AccessPhase = OnlineAccessPhase | "offline";
const DEFAULT_PERMISSIONS = buildDefaultRolePermissions();

function clearOfflineAuthorization() {
  delete (window as OfflineWindow).__posOfflineAuthorization;
}

function hasValidOfflineAuthorization(identity: {
  role: Role | null; userId: string | null; storeId: string | null;
  authorizationFingerprint: string | null; permissionsVerified: boolean;
}, handoff: OfflineAuthorization | undefined) {
  if (!identity.permissionsVerified || !identity.role || !identity.userId ||
      !identity.authorizationFingerprint || window.location.pathname.replace(/\/$/, "") !== "/pos") return false;
  const storeId = identity.storeId || "store-main";
  if (!handoff || handoff.cashierId !== identity.userId || handoff.storeId !== storeId ||
      handoff.role !== identity.role || handoff.authorizationFingerprint !== identity.authorizationFingerprint) return false;
  const age = Date.now() - Date.parse(handoff.preparedAt);
  if (!Number.isFinite(age) || age < -300_000 || age > 7 * 24 * 60 * 60 * 1000) return false;
  try { return offlineRevocationMatches(identity.userId, storeId, handoff.revocationMarker); } catch { return false; }
}

interface RoleProviderProps {
  children: React.ReactNode;
  role: Role | null;
  userId: string | null;
  userName: string | null;
  storeId?: string | null;
  authorizationFingerprint?: string | null;
  permissions?: RolePermissions;
  permissionsVerified?: boolean;
}

export function RoleProvider({
  children,
  role,
  userId,
  userName,
  storeId = null,
  authorizationFingerprint = null,
  permissions = DEFAULT_PERMISSIONS,
  permissionsVerified = true,
}: RoleProviderProps) {
  const pathname = usePathname();
  const identityKey = JSON.stringify([role, userId, storeId, authorizationFingerprint, permissionsVerified]);
  const [view, setView] = useState<{ key: string; phase: AccessPhase }>({
    key: identityKey, phase: permissionsVerified ? "checking" : "unavailable",
  });
  const access = view.key === identityKey ? view.phase : "checking";
  const offlineAuthorization = useRef<OfflineAuthorization | undefined>(undefined);
  const offlineGuard = useRef<OfflineGuard | undefined>(undefined);
  const handoffRead = useRef(false);
  const endedIdentity = useRef<string | null>(null);
  useEffect(() => {
    if (!handoffRead.current) {
      handoffRead.current = true;
      offlineAuthorization.current = (window as OfflineWindow).__posOfflineAuthorization;
      offlineGuard.current = (window as OfflineWindow).__posOfflineRevocationGuard;
      delete (window as OfflineWindow).__posOfflineRevocationGuard;
      clearOfflineAuthorization();
    }
    const identity = { role, userId, storeId, authorizationFingerprint, permissionsVerified };
    const initialSnapshot: CurrentRoleAccess | null = permissionsVerified && role && userId && authorizationFingerprint
      && navigator.onLine !== false && !offlineAuthorization.current ? {
      user: { id: userId, name: userName ?? "", role, storeId },
      authorizationFingerprint,
      permissions,
    } : null;
    let onlineAccess = createOnlineAccessState(initialSnapshot);
    let disposed = false;
    let connectivity = 0;
    const show = (phase: AccessPhase) => {
      if (disposed) return;
      setView(current => current.key === identityKey && current.phase === phase ? current : { key: identityKey, phase });
    };
    const transition = (event: OnlineAccessEvent) => {
      onlineAccess = reduceOnlineAccessState(onlineAccess, event);
      show(onlineAccess.phase);
    };
    const sessionEnded = () => onlineAccess.phase === "login-required";
    const mayApply = (generation: number, signal?: AbortSignal) =>
      !disposed && !signal?.aborted && generation === onlineAccess.generation && !sessionEnded();
    const offlineAllowed = async (handoff: OfflineAuthorization | undefined) => {
      if (!handoff || !offlineGuard.current || offlineGuard.current.has(handoff.cashierId, handoff.storeId) ||
          !hasValidOfflineAuthorization(identity, handoff)) return false;
      try {
        return await isCurrentOfflineAuthorization(handoff) && !offlineGuard.current.has(handoff.cashierId, handoff.storeId);
      } catch { return false; }
    };
    const settleOffline = async (expectedGeneration: number, expectedConnectivity: number, signal?: AbortSignal) => {
      const handoff = offlineAuthorization.current;
      const allowed = await offlineAllowed(handoff);
      if (mayApply(expectedGeneration, signal) && expectedConnectivity === connectivity
          && handoff === offlineAuthorization.current) {
        show(allowed ? "offline" : onlineAccess.snapshot ? "recovering" : "unavailable");
      }
    };
    const revoke = () => {
      clearOfflineAuthorization();
      offlineAuthorization.current = undefined;
      if (userId) {
        void invalidateOfflineAccess(userId, storeId || "store-main").catch(() => undefined);
      }
    };
    if (endedIdentity.current === identityKey) {
      show("login-required");
      return;
    }
    if (navigator.onLine === false) {
      show("checking");
      void settleOffline(onlineAccess.generation, connectivity);
    } else {
      show(permissionsVerified ? onlineAccess.phase : "unavailable");
    }
    if (!role || !userId || !authorizationFingerprint) return;
    const refresh = async (signal: AbortSignal, requestGeneration: number) => {
      if (!mayApply(requestGeneration, signal)) return;
      const startedOn = connectivity;
      try {
        const latest = await loadCurrentRoleAccess(signal, {
          onRetrying: () => {
            if (!mayApply(requestGeneration, signal) || startedOn !== connectivity) return;
            if (offlineAuthorization.current) {
              void settleOffline(requestGeneration, startedOn, signal);
            } else {
              transition({ type: "retrying", generation: requestGeneration });
            }
          },
        });
        if (!mayApply(requestGeneration, signal)) return;
        if (latest.user.id !== userId || latest.user.role !== role || latest.user.storeId !== storeId ||
          latest.authorizationFingerprint !== authorizationFingerprint) {
          transition({ type: "start-generation", phase: "forbidden" });
          revoke();
          window.location.reload();
          return;
        }
        if (startedOn !== connectivity) return;
        if (navigator.onLine === false) {
          await settleOffline(requestGeneration, startedOn, signal);
        } else {
          clearOfflineAuthorization();
          offlineAuthorization.current = undefined;
          transition({ type: "verified", generation: requestGeneration, snapshot: latest });
        }
      } catch (error) {
        if (!mayApply(requestGeneration, signal)) {
          if (!disposed && !signal.aborted && error instanceof PermissionRefreshError && error.retryAfterMs > 0) throw error;
          return;
        }
        const kind = error instanceof PermissionRefreshError ? error.kind : "transient";
        // An authoritative denial still applies if connectivity changed while checking this session.
        if (kind === "unauthenticated" || kind === "forbidden") {
          transition({ type: "failed", generation: requestGeneration, kind });
          if (kind === "unauthenticated") {
            endedIdentity.current = identityKey;
            stop?.();
          }
          revoke();
          return;
        }
        if (kind === "invalid" && !onlineAccess.snapshot) revoke();
        if (startedOn === connectivity) {
          if (kind === "transient" && offlineAuthorization.current) {
            await settleOffline(requestGeneration, startedOn, signal);
          } else {
            transition({ type: "failed", generation: requestGeneration, kind });
          }
        }
        // The scheduler uses Retry-After even after the final attempt.
        throw error;
      }
    };
    const online = () => {
      if (sessionEnded() || onlineAccess.phase === "forbidden") return;
      connectivity++;
      clearOfflineAuthorization();
      offlineAuthorization.current = undefined;
      if (onlineAccess.snapshot) transition({ type: "retrying", generation: onlineAccess.generation });
      else show("checking");
    };
    const offline = () => {
      if (sessionEnded() || onlineAccess.phase === "forbidden") return;
      connectivity++;
      if (onlineAccess.snapshot) transition({ type: "retrying", generation: onlineAccess.generation });
      else show("checking");
      void settleOffline(onlineAccess.generation, connectivity);
    };
    const blockRevokedSession = () => {
      const hadHandoff = Boolean(offlineAuthorization.current);
      clearOfflineAuthorization();
      offlineAuthorization.current = undefined;
      if (sessionEnded() || onlineAccess.phase === "forbidden") return;
      if (!hadHandoff && !onlineAccess.snapshot) return;
      transition({ type: "start-generation" });
      window.dispatchEvent(new Event("pos:permissions-changed"));
      if (navigator.onLine === false) show("unavailable");
    };
    const markSignedOut = () => {
      endedIdentity.current = identityKey;
      clearOfflineAuthorization();
      offlineAuthorization.current = undefined;
      transition({ type: "start-generation", phase: "login-required" });
      stop?.();
    };
    const unsubscribeGuard = offlineGuard.current?.subscribe((cashierId, revokedStoreId) => {
      if (cashierId === userId && revokedStoreId === (storeId || "store-main")) blockRevokedSession();
    });
    const storage = (event: StorageEvent) => {
      if (event.key === POS_SESSION_ENDED_EVENT && event.newValue !== null) {
        markSignedOut();
      } else if (event.key === offlineRevocationKey(userId, storeId || "store-main") && event.newValue !== null) {
        blockRevokedSession();
      } else if (event.key === "pos:permissions-version" && !sessionEnded()) {
        transition({ type: "start-generation" });
        revoke();
      }
    };
    let revocationChannel: BroadcastChannel | undefined;
    try {
      revocationChannel = new BroadcastChannel(OFFLINE_REVOCATION_CHANNEL);
      revocationChannel.onmessage = (event) => {
        if (event.data?.cashierId === userId && event.data?.storeId === (storeId || "store-main")) blockRevokedSession();
      };
    } catch { /* Storage events remain the primary cross-tab signal. */ }
    window.addEventListener("offline", offline);
    window.addEventListener("storage", storage);
    window.addEventListener(POS_SESSION_ENDED_EVENT, markSignedOut);
    const stop = startPermissionRefresh(signal => refresh(signal, onlineAccess.generation), { onOnline: online });
    return () => {
      disposed = true;
      window.removeEventListener("offline", offline);
      window.removeEventListener("storage", storage);
      window.removeEventListener(POS_SESSION_ENDED_EVENT, markSignedOut);
      revocationChannel?.close();
      unsubscribeGuard?.();
      stop?.();
    };
  }, [role, userId, userName, storeId, authorizationFingerprint, permissionsVerified, permissions, identityKey]);

  const offline = access === "offline";
  const recovering = access === "recovering";
  const verified = (access === "verified" || recovering || offline) && (!offline || pathname === "/pos" || pathname === "/pos/");
  const denied = access === "login-required" || access === "forbidden";
  const sessionRecovering = Boolean(role) && access !== "verified" && !offline && !denied;

  const canAccess = useCallback(
    (path: string) => {
      if (!role || !verified) return false;
      if (offline && path !== "/pos" && path !== "/pos/") return false;
      return canRoleAccessPage(role, path, permissions);
    },
    [role, permissions, verified, offline],
  );

  const canPerform = useCallback(
    (resource: string, action: Action) => {
      if (!role || !verified) return false;
      if (offline) {
        const transactionResource = role === "SALES" ? "transaction.request" : "transaction";
        const allowed = (resource === transactionResource && action === "create") ||
          (resource === "shift" && (action === "read" || action === "create" || action === "update"));
        if (!allowed) return false;
      }
      return canRolePerformAction(role, resource, action, permissions);
    },
    [role, permissions, verified, offline],
  );

  const value = useMemo(
    () => ({
      role,
      userId: denied ? null : userId,
      userName,
      storeId,
      authorizationFingerprint,
      isOfflineSession: offline,
      isSessionRecovering: sessionRecovering,
      canAccess,
      canPerform,
    }),
    [role, userId, userName, storeId, authorizationFingerprint, denied, offline, sessionRecovering, canAccess, canPerform],
  );

  const blocked = Boolean(role) && !verified && pathname !== "/login" && pathname !== "/login/";
  return (
    <RoleContext.Provider value={value}>
      <span hidden data-offline-auth-user={userId ?? ""} data-offline-auth-store={storeId || "store-main"}
        data-offline-auth-role={role ?? ""} data-offline-auth-fingerprint={authorizationFingerprint ?? ""}
        data-offline-auth-verified={String(permissionsVerified)} />
      {recovering && !blocked && (
        <p role="status" className="pointer-events-none fixed left-1/2 top-2 z-[180] w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-950 shadow">
          Koneksi sedang dipulihkan. Isian Anda tetap ada di halaman ini.
        </p>
      )}
      {blocked && access !== "checking" && <AccessStatus
        reason={access === "login-required" || access === "forbidden" ? access : "unavailable"}
        onRetry={() => window.dispatchEvent(new Event("pos:permissions-changed"))}
      />}
      <div key={identityKey} style={{ display: blocked ? "none" : "contents" }} hidden={blocked}>
        {blocked && denied ? null : children}
      </div>
    </RoleContext.Provider>
  );
}
