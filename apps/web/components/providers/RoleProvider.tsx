"use client";

import React, { createContext, useContext } from "react";
import type { Role } from "@/lib/rbac/permissions";
import { canAccessPage, canPerformAction, Action } from "@/lib/rbac/permissions";

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
}

export function RoleProvider({ children, role, userId, userName }: RoleProviderProps) {
  const canAccess = (path: string) => {
    if (!role) return false;
    return canAccessPage(role, path);
  };

  const canPerform = (resource: string, action: Action) => {
    if (!role) return false;
    return canPerformAction(role, resource, action);
  };

  return (
    <RoleContext.Provider value={{ role, userId, userName, canAccess, canPerform }}>
      {children}
    </RoleContext.Provider>
  );
}
