// ============================================================
// Server-side RBAC Guard — Used in API route handlers
// ============================================================

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { db } from "@pos/db";
import type { Role } from "./permissions";
import type { Action } from "./permissions";
import {
  buildDefaultRolePermissions,
  canRolePerformAction,
} from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import { apiError } from "@/lib/api/responses";

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

function isE2EAuthBypassEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_AUTH_BYPASS === "1"
  );
}

async function getE2EUser() {
  if (!isE2EAuthBypassEnabled()) return null;

  const cookieStore = await cookies();
  const role = (cookieStore.get("x-pos-role")?.value || "OWNER") as Role;
  const validRoles: Role[] = ["OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY"];
  if (!validRoles.includes(role)) {
    throw new AuthError(401, "Invalid E2E role");
  }

  const id = cookieStore.get("x-pos-user-id")?.value || "e2e-user";
  const rawName = cookieStore.get("x-pos-user-name")?.value || "E2E User";
  let name = rawName;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    name = rawName;
  }

  return {
    id,
    username: `e2e-${role.toLowerCase()}`,
    name,
    role,
    storeId: cookieStore.get("x-pos-store-id")?.value || "store-main",
    isActive: true,
  };
}

/**
 * Verify the caller's JWT and return its claims, or null when there is no
 * session or the token fails verification.
 *
 * Uses `getClaims()` rather than `getUser()`: the project signs tokens with an
 * asymmetric ES256 key, so the signature is checked locally against the cached
 * JWKS instead of costing a round trip to the Auth server on every request.
 * `getClaims()` falls back to a server call by itself if the project ever
 * reverts to a symmetric signing secret, so this stays correct either way.
 */
async function getVerifiedClaims() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) return null;

  return data.claims;
}

/** The POS username is the email prefix (e.g. "kasir" from "kasir@pos.local"). */
function usernameFromClaims(claims: { email?: unknown }): string | undefined {
  const email = claims.email;
  if (typeof email !== "string") return undefined;
  return email.split("@")[0] || undefined;
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
  const e2eUser = await getE2EUser();
  if (e2eUser) {
    if (!allowedRoles.includes(e2eUser.role)) {
      throw new AuthError(403, "Insufficient permissions");
    }
    return e2eUser;
  }

  const claims = await getVerifiedClaims();

  if (!claims) {
    throw new AuthError(401, "Unauthorized");
  }

  // Resolve Supabase auth user → pos_users record
  const username = usernameFromClaims(claims);

  if (!username) {
    throw new AuthError(401, "Invalid user identity");
  }

  const posUser = await db.user.findFirst({
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

  if (!posUser) {
    throw new AuthError(401, "User not found in POS system");
  }

  if (!posUser.isActive) {
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
  const permissions = isE2EAuthBypassEnabled()
    ? buildDefaultRolePermissions()
    : await getGlobalRolePermissions();

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
  const e2eUser = await getE2EUser();
  if (e2eUser) return e2eUser;

  const claims = await getVerifiedClaims();
  if (!claims) return null;

  const username = usernameFromClaims(claims);
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
