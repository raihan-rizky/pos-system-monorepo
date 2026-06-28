// ============================================================
// Server-side RBAC Guard — Used in API route handlers
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { db } from "@pos/db";
import type { Role } from "./permissions";
import type { Action } from "./permissions";
import { canRolePerformAction } from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import { apiError } from "@/lib/api/responses";

// Short-lived in-memory cache for POS user lookups (survives across requests in the same worker)
const POS_USER_CACHE_TTL = 60_000; // 60 seconds
type CachedUser = {
  id: string;
  username: string;
  name: string;
  role: string;
  storeId: string | null;
  isActive: boolean;
  cachedAt: number;
};
const posUserCache = new Map<string, CachedUser>();
/**
 * Custom error for authentication/authorization failures.
 */
export class AuthError extends Error {
  public statusCode: number;

  constructor(statusCode: number, message?: string) {
    super(message || (statusCode === 401 ? "Unauthorized" : "Forbidden"));
    this.statusCode = statusCode;
    this.name = "AuthError";
  }
}

/**
 * Require the current user to have one of the specified roles.
 *
 * Usage in API routes:
 * ```ts
 * export async function GET() {
 *   try {
 *     const user = await requireRole('OWNER', 'ADMIN');
 *     // ... proceed with authorized logic
 *   } catch (error) {
 *     if (error instanceof AuthError) {
 *       return NextResponse.json({ message: error.message }, { status: error.statusCode });
 *     }
 *     return NextResponse.json({ message: 'Internal error' }, { status: 500 });
 *   }
 * }
 * ```
 *
 * @returns The pos_users record (with id, username, name, role, storeId)
 * @throws AuthError with 401 if not authenticated, 403 if wrong role
 */
export async function requireRole(...allowedRoles: Role[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AuthError(401, "Unauthorized");
  }

  // Resolve Supabase auth user → pos_users record
  // The username is the email prefix (e.g., "kasir1" from "kasir1@pos.local")
  const username = user.email?.split("@")[0];

  if (!username) {
    throw new AuthError(401, "Invalid user identity");
  }

  // Check in-memory cache first to avoid a DB round-trip
  const now = Date.now();
  const cached = posUserCache.get(username);
  let posUser: CachedUser | null = null;

  if (cached && now - cached.cachedAt < POS_USER_CACHE_TTL) {
    posUser = cached;
  } else {
    const dbUser = await db.user.findFirst({
      where: { username },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        storeId: true,
        isActive: true,
      },
    });

    if (dbUser) {
      posUser = { ...dbUser, cachedAt: now };
      posUserCache.set(username, posUser);
    }
  }

  if (!posUser) {
    throw new AuthError(401, "User not found in POS system");
  }

  if (!posUser.isActive) {
    posUserCache.delete(username); // Evict deactivated users immediately
    throw new AuthError(403, "Account deactivated");
  }

  if (!allowedRoles.includes(posUser.role as Role)) {
    throw new AuthError(403, "Insufficient permissions");
  }

  return posUser;
}

/**
 * Require the current user to have a configured resource permission.
 */
export async function requirePermission(resource: string, action: Action) {
  const user = await requireRole("OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY");
  const permissions = await getGlobalRolePermissions();

  if (!canRolePerformAction(user.role as Role, resource, action, permissions)) {
    throw new AuthError(403, "Insufficient permissions");
  }

  return user;
}

/**
 * Get the current authenticated user WITHOUT role checking.
 * Useful when you need the user info but want to handle role logic yourself.
 *
 * @returns The pos_users record or null if not authenticated
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const username = user.email?.split("@")[0];
  if (!username) return null;

  return db.user.findFirst({
    where: { username, isActive: true },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      storeId: true,
      isActive: true,
    },
  });
}

/**
 * Helper to create a consistent error response from an AuthError.
 */
export function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return apiError(error.message, error.statusCode, {
      code: error.statusCode === 401 ? "Unauthorized" : "Forbidden",
    });
  }
  return null;
}
