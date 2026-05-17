"use client";

import React, { createContext, useContext } from "react";
import type { Role } from "@/lib/rbac/permissions";
import { Action } from "@/lib/rbac/permissions";
import {
  buildDefaultRolePermissions,
  canRoleAccessPage,
  canRolePerformAction,
} from "@/features/rbac/helpers/rbac-core";
import type { RolePermissions } from "@/features/rbac/helpers/rbac-core";

interface RoleContextType {
  role: Role | null;
  userId: string | null;
  userName: string | null;
  canAccess: (path: string) => boolean;
  canPerform: (resource: string, action: Action) => boolean;
}

const RoleContext = createContext<RoleContextType>({
  role: null,
  userId: null,
  userName: null,
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
  permissions?: RolePermissions;
}

export function RoleProvider({
  children,
  role,
  userId,
  userName,
  permissions = buildDefaultRolePermissions(),
}: RoleProviderProps) {
  const canAccess = (path: string) => {
    if (!role) return false;
    return canRoleAccessPage(role, path, permissions);
  };

  const canPerform = (resource: string, action: Action) => {
    if (!role) return false;
    return canRolePerformAction(role, resource, action, permissions);
  };

  return (
    <RoleContext.Provider value={{ role, userId, userName, canAccess, canPerform }}>
      {children}
    </RoleContext.Provider>
  );
}
