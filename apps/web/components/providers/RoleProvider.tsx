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
import { loadCurrentRoleAccess, PermissionRefreshError, startPermissionRefresh } from "@/features/rbac/helpers/permission-refresh";
import { AccessStatus } from "@/features/rbac/components/AccessStatus";
import { invalidateOfflineAccess, isCurrentOfflineAuthorization, OFFLINE_REVOCATION_CHANNEL, offlineRevocationKey, offlineRevocationMatches } from "@/public/offline-vault.mjs";

interface RoleContextType {
  role: Role | null;
  userId: string | null;
  userName: string | null;
  storeId: string | null;
  authorizationFingerprint: string | null;
  isOfflineSession: boolean;
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
  permissions = buildDefaultRolePermissions(),
  permissionsVerified = true,
}: RoleProviderProps) {
  const pathname = usePathname();
  const [access, setAccess] = useState<"checking" | "verified" | "offline" | "blocked">(permissionsVerified ? "checking" : "blocked");
  const offlineAuthorization = useRef<OfflineAuthorization | undefined>(undefined);
  const offlineGuard = useRef<OfflineGuard | undefined>(undefined);
  const handoffRead = useRef(false);
  useEffect(() => {
    if (!handoffRead.current) {
      handoffRead.current = true;
      offlineAuthorization.current = (window as OfflineWindow).__posOfflineAuthorization;
      offlineGuard.current = (window as OfflineWindow).__posOfflineRevocationGuard;
      delete (window as OfflineWindow).__posOfflineRevocationGuard;
      clearOfflineAuthorization();
    }
    const identity = { role, userId, storeId, authorizationFingerprint, permissionsVerified };
    let generation = 0;
    const offlineAllowed = async () => {
      const handoff = offlineAuthorization.current;
      if (!handoff || !offlineGuard.current || offlineGuard.current.has(handoff.cashierId, handoff.storeId) ||
          !hasValidOfflineAuthorization(identity, handoff)) return false;
      try {
        return await isCurrentOfflineAuthorization(handoff) && !offlineGuard.current.has(handoff.cashierId, handoff.storeId);
      } catch { return false; }
    };
    const settleOffline = async (expectedGeneration: number, signal?: AbortSignal) => {
      const allowed = await offlineAllowed();
      if (!signal?.aborted && expectedGeneration === generation) setAccess(allowed ? "offline" : "blocked");
    };
    const revoke = () => {
      clearOfflineAuthorization();
      offlineAuthorization.current = undefined;
      if (userId) {
        void invalidateOfflineAccess(userId, storeId || "store-main").catch(() => undefined);
      }
    };
    if (navigator.onLine === false) {
      setAccess("checking");
      void settleOffline(generation);
    } else {
      setAccess(offlineAuthorization.current ? "checking" : permissionsVerified ? "verified" : "blocked");
    }
    if (!role || !userId || !authorizationFingerprint) return;
    const refresh = async (signal: AbortSignal, requestGeneration: number) => {
      try {
        const latest = await loadCurrentRoleAccess(signal);
        if (signal.aborted) return;
        if (latest.user.id !== userId || latest.user.role !== role || latest.user.storeId !== storeId ||
          latest.authorizationFingerprint !== authorizationFingerprint) {
          generation++;
          revoke();
          setAccess("blocked");
          // A full navigation clears data caches and reruns page authorization,
          // including when the current page was revoked or the account changed.
          window.location.reload();
          return;
        }
        if (requestGeneration !== generation) return;
        if (navigator.onLine === false) {
          await settleOffline(requestGeneration, signal);
        } else {
          clearOfflineAuthorization();
          offlineAuthorization.current = undefined;
          setAccess("verified");
        }
      } catch (error) {
        if (signal.aborted) return;
        const denied = error instanceof PermissionRefreshError &&
          (error.reason === "invalid" || error.status === 401 || error.status === 403);
        if (denied) {
          generation++;
          revoke();
          setAccess("blocked");
          return;
        }
        if (requestGeneration !== generation) return;
        const offlineFailure = !(error instanceof PermissionRefreshError) || error.status === 502 || error.status === 503 || error.status === 504;
        if (offlineFailure) await settleOffline(requestGeneration, signal);
        else setAccess("blocked");
      }
    };
    const online = () => {
      generation++;
      clearOfflineAuthorization();
      offlineAuthorization.current = undefined;
      setAccess("blocked");
    };
    const offline = () => {
      generation++;
      setAccess("checking");
      void settleOffline(generation);
    };
    const blockRevokedSession = () => {
      generation++;
      clearOfflineAuthorization();
      offlineAuthorization.current = undefined;
      setAccess("blocked");
    };
    const unsubscribeGuard = offlineGuard.current?.subscribe((cashierId, revokedStoreId) => {
      if (cashierId === userId && revokedStoreId === (storeId || "store-main")) blockRevokedSession();
    });
    const storage = (event: StorageEvent) => {
      if (event.key === offlineRevocationKey(userId, storeId || "store-main") && event.newValue !== null) {
        blockRevokedSession();
      } else if (event.key === "pos:permissions-version") {
        generation++;
        revoke();
        setAccess("blocked");
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
    const stop = startPermissionRefresh(signal => refresh(signal, generation), { onOnline: online });
    return () => {
      generation++;
      window.removeEventListener("offline", offline);
      window.removeEventListener("storage", storage);
      revocationChannel?.close();
      unsubscribeGuard?.();
      stop();
    };
  }, [role, userId, storeId, authorizationFingerprint, permissionsVerified]);

  const offline = access === "offline";
  const verified = (access === "verified" || offline) && (!offline || pathname === "/pos" || pathname === "/pos/");

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
      userId,
      userName,
      storeId,
      authorizationFingerprint,
      isOfflineSession: offline,
      canAccess,
      canPerform,
    }),
    [role, userId, userName, storeId, authorizationFingerprint, offline, canAccess, canPerform],
  );

  const blocked = Boolean(role) && !verified;
  return (
    <RoleContext.Provider value={value}>
      <span hidden data-offline-auth-user={userId ?? ""} data-offline-auth-store={storeId || "store-main"}
        data-offline-auth-role={role ?? ""} data-offline-auth-fingerprint={authorizationFingerprint ?? ""}
        data-offline-auth-verified={String(permissionsVerified)} />
      {blocked && access === "blocked" && <AccessStatus unavailable onRetry={() => window.dispatchEvent(new Event("pos:permissions-changed"))} />}
      <div style={{ display: blocked ? "none" : "contents" }} hidden={blocked}>{children}</div>
    </RoleContext.Provider>
  );
}
