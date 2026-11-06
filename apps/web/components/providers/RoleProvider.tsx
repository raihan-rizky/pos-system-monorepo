"use client";

import React, { createContext, useContext, useCallback, useMemo, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/rbac/permissions";
import { Action } from "@/lib/rbac/permissions";
import {
  buildDefaultRolePermissions,
  canRoleAccessPage,
  canRolePerformAction,
} from "@/features/rbac/helpers/rbac-core";
import type { RolePermissions } from "@/features/rbac/helpers/rbac-core";
import { loadCurrentRoleAccess, startPermissionRefresh } from "@/features/rbac/helpers/permission-refresh";
import { AccessStatus } from "@/features/rbac/components/AccessStatus";
import {
  isOfflineActionAllowed,
  isOfflinePathAllowed,
  isOfflineSessionUsable,
  type OfflineSessionHandoff,
} from "@/features/rbac/helpers/offline-session";

interface RoleContextType {
  role: Role | null;
  userId: string | null;
  userName: string | null;
  storeId: string | null;
  authorizationFingerprint: string | null;
  canAccess: (path: string) => boolean;
  canPerform: (resource: string, action: Action) => boolean;
}

const RoleContext = createContext<RoleContextType>({
  role: null,
  userId: null,
  userName: null,
  storeId: null,
  authorizationFingerprint: null,
  canAccess: () => false,
  canPerform: () => false,
});

export function useRole() {
  return useContext(RoleContext);
}

type OfflineWindow = Window & { __posOfflineHandoff?: OfflineSessionHandoff };

function readOfflineHandoff(): OfflineSessionHandoff | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as OfflineWindow).__posOfflineHandoff;
  if (!candidate || typeof candidate.cashierId !== "string" || typeof candidate.storeId !== "string" ||
      typeof candidate.preparedAt !== "string" || typeof candidate.nonce !== "string") return null;
  return candidate;
}

function clearOfflineHandoff() {
  if (typeof window !== "undefined") delete (window as OfflineWindow).__posOfflineHandoff;
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
  const [verified, setVerified] = useState(permissionsVerified);
  const [offlineHandoff, setOfflineHandoff] = useState<OfflineSessionHandoff | null>(null);

  useEffect(() => {
    const syncHandoff = () => {
      const candidate = readOfflineHandoff();
      if (candidate && isOfflineSessionUsable(candidate, { userId, storeId })) {
        setOfflineHandoff(candidate);
      } else {
        setOfflineHandoff(null);
      }
    };
    const handleOnline = () => {
      // Do not keep showing offline content while the server authorization is being checked.
      clearOfflineHandoff();
      setOfflineHandoff(null);
      setVerified(false);
      window.dispatchEvent(new Event("pos:permissions-changed"));
    };
    syncHandoff();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [userId, storeId]);

  useEffect(() => {
    setVerified(permissionsVerified);
    if (!role || !userId || !authorizationFingerprint) return;
    return startPermissionRefresh(async (signal) => {
      try {
        const latest = await loadCurrentRoleAccess(signal);
        if (signal.aborted) return;
        if (latest.user.id !== userId || latest.user.role !== role || latest.user.storeId !== storeId ||
          latest.authorizationFingerprint !== authorizationFingerprint) {
          clearOfflineHandoff();
          setOfflineHandoff(null);
          setVerified(false);
          // A full navigation clears data caches and reruns page authorization,
          // including when the current page was revoked or the account changed.
          window.location.reload();
          return;
        }
        clearOfflineHandoff();
        setOfflineHandoff(null);
        setVerified(true);
      } catch {
        if (!signal.aborted) {
          const candidate = readOfflineHandoff();
          if (permissionsVerified && !navigator.onLine && candidate && isOfflineSessionUsable(candidate, { userId, storeId })) {
            setOfflineHandoff(candidate);
            setVerified(true);
            return;
          }
          setVerified(false);
        }
      }
    });
  }, [role, userId, storeId, authorizationFingerprint, permissionsVerified]);

  const canAccess = useCallback(
    (path: string) => {
      if (!role || !verified) return false;
      if (offlineHandoff && !isOfflinePathAllowed(path)) return false;
      return canRoleAccessPage(role, path, permissions);
    },
    [role, permissions, verified, offlineHandoff],
  );

  const canPerform = useCallback(
    (resource: string, action: Action) => {
      if (!role || !verified) return false;
      if (offlineHandoff) {
        if (!isOfflineActionAllowed(role, resource, action)) return false;
      }
      return canRolePerformAction(role, resource, action, permissions);
    },
    [role, permissions, verified, offlineHandoff],
  );

  const value = useMemo(
    () => ({
      role,
      userId,
      userName,
      storeId,
      authorizationFingerprint,
      canAccess,
      canPerform,
    }),
    [role, userId, userName, storeId, authorizationFingerprint, canAccess, canPerform],
  );

  const blocked = Boolean(role) && (!verified || Boolean(offlineHandoff && !isOfflinePathAllowed(pathname || "")));
  return (
    <RoleContext.Provider value={value}>
      {blocked && <AccessStatus unavailable onRetry={() => window.dispatchEvent(new Event("pos:permissions-changed"))} />}
      <div style={{ display: blocked ? "none" : "contents" }} hidden={blocked}>{children}</div>
    </RoleContext.Provider>
  );
}
