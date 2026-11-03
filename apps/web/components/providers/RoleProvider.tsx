"use client";

import React, { createContext, useContext, useCallback, useMemo, useEffect, useState } from "react";
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
  const [verified, setVerified] = useState(permissionsVerified);
  useEffect(() => {
    setVerified(permissionsVerified);
    if (!role || !userId || !authorizationFingerprint) return;
    return startPermissionRefresh(async (signal) => {
      try {
        const latest = await loadCurrentRoleAccess(signal);
        if (signal.aborted) return;
        if (latest.user.id !== userId || latest.user.role !== role || latest.user.storeId !== storeId ||
          latest.authorizationFingerprint !== authorizationFingerprint) {
          setVerified(false);
          // A full navigation clears data caches and reruns page authorization,
          // including when the current page was revoked or the account changed.
          window.location.reload();
          return;
        }
        setVerified(true);
      } catch {
        if (!signal.aborted) setVerified(false);
      }
    });
  }, [role, userId, storeId, authorizationFingerprint, permissionsVerified]);

  const canAccess = useCallback(
    (path: string) => {
      if (!role || !verified) return false;
      return canRoleAccessPage(role, path, permissions);
    },
    [role, permissions, verified],
  );

  const canPerform = useCallback(
    (resource: string, action: Action) => {
      if (!role || !verified) return false;
      return canRolePerformAction(role, resource, action, permissions);
    },
    [role, permissions, verified],
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

  const blocked = Boolean(role) && !verified;
  return (
    <RoleContext.Provider value={value}>
      {blocked && <AccessStatus unavailable onRetry={() => window.dispatchEvent(new Event("pos:permissions-changed"))} />}
      <div style={{ display: blocked ? "none" : "contents" }} hidden={blocked}>{children}</div>
    </RoleContext.Provider>
  );
}
