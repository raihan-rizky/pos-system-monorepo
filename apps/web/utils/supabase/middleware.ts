import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_PAGE, isValidRole } from "@/lib/rbac/permissions";
import type { Role } from "@/lib/rbac/permissions";
import {
  buildDefaultRolePermissions,
  canRoleAccessPage,
  normalizeRolePermissions,
} from "@/features/rbac/helpers/rbac-core";
import type { PermissionEntry } from "@/features/rbac/helpers/rbac-core";
import { getLogger } from "@/lib/logger";

const log = getLogger("supabase-middleware");

const ROLE_COOKIE = "x-pos-role";
const USER_ID_COOKIE = "x-pos-user-id";
const USER_NAME_COOKIE = "x-pos-user-name";

export async function updateSession(request: NextRequest) {
  if (process.env.E2E_AUTH_BYPASS === "1") {
    const role = (request.cookies.get(ROLE_COOKIE)?.value || "OWNER") as Role;
    const userId = request.cookies.get(USER_ID_COOKIE)?.value || "e2e-user";
    const userName = request.cookies.get(USER_NAME_COOKIE)?.value || "E2E Owner";

    const response = NextResponse.next({ request });
    const cookieOptions = {
      path: "/",
      httpOnly: false,
      sameSite: "strict" as const,
      secure: false,
      maxAge: 60 * 60,
    };

    response.cookies.set(ROLE_COOKIE, role, cookieOptions);
    response.cookies.set(USER_ID_COOKIE, userId, cookieOptions);
    response.cookies.set(USER_NAME_COOKIE, userName, cookieOptions);

    if (
      !request.nextUrl.pathname.startsWith("/api/") &&
      request.nextUrl.pathname !== "/" &&
      request.nextUrl.pathname !== "/login" &&
      !request.nextUrl.pathname.startsWith("/auth") &&
      isValidRole(role) &&
      !canRoleAccessPage(role, request.nextUrl.pathname, buildDefaultRolePermissions())
    ) {
      const url = request.nextUrl.clone();
      url.pathname = DEFAULT_PAGE[role];
      log.debug("e2e.redirect", { from: request.nextUrl.pathname, to: url.pathname, role });
      return NextResponse.redirect(url);
    }

    return response;
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not authenticated
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      log.debug("unauthenticated.api", { path: request.nextUrl.pathname });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    log.debug("unauthenticated.redirect", { path: request.nextUrl.pathname });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated: resolve POS identity for the current Supabase user. Do not
  // trust existing x-pos-* cookies: they can belong to a previous account in
  // the same browser session.
  if (user) {
    let role: Role | undefined;

    try {
      const username = user.email?.split("@")[0];
      const { data: posUser } = username
        ? await supabase
            .from("pos_users")
            .select("id, name, role, isActive")
            .eq("username", username)
            .maybeSingle()
        : { data: null };

      if (posUser && posUser.isActive && isValidRole(posUser.role)) {
        role = posUser.role as Role;

        const cookieOptions = {
          path: "/",
          httpOnly: false,
          sameSite: "strict" as const,
          secure: process.env.NODE_ENV === "production",
          maxAge: 60 * 60 * 24,
        };
        request.cookies.set(ROLE_COOKIE, role);
        request.cookies.set(USER_ID_COOKIE, posUser.id);
        request.cookies.set(USER_NAME_COOKIE, posUser.name);
        supabaseResponse.cookies.set(ROLE_COOKIE, role, cookieOptions);
        supabaseResponse.cookies.set(USER_ID_COOKIE, posUser.id, cookieOptions);
        supabaseResponse.cookies.set(USER_NAME_COOKIE, posUser.name, cookieOptions);
        log.info("role.resolved", { username, role });
      } else {
        log.warn("user.inactive_or_missing", { username, hasPosUser: Boolean(posUser) });
        if (request.nextUrl.pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (request.nextUrl.pathname === "/login") {
          await supabase.auth.signOut();
          return supabaseResponse;
        }

        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("error", "Account not found or deactivated");
        return NextResponse.redirect(url);
      }
    } catch (error) {
      if (request.nextUrl.pathname.startsWith("/api/")) {
        log.error("role.resolve.failed.api", { error, path: request.nextUrl.pathname });
        return NextResponse.json({ error: "Unable to verify access" }, { status: 503 });
      }
      log.error("role.resolve.failed", { error, path: request.nextUrl.pathname });
      if (!role) {
        return supabaseResponse;
      }
    }

    if (role && !request.nextUrl.pathname.startsWith("/api/")) {
      const pathname = request.nextUrl.pathname;

      if (
        pathname !== "/" &&
        pathname !== "/login" &&
        !pathname.startsWith("/auth")
      ) {
        const canAccess = await canAccessPageWithConfiguredPermissions(
          supabase,
          role,
          pathname,
        );

        if (!canAccess) {
          log.info("page.access.denied", { role, path: pathname });
          const url = request.nextUrl.clone();
          url.pathname = DEFAULT_PAGE[role];
          return NextResponse.redirect(url);
        }
      }
    }
  }

  return supabaseResponse;
}

type PermissionClient = {
  from: (table: string) => {
    select: (columns: string) => unknown;
  };
};

async function canAccessPageWithConfiguredPermissions(
  supabase: PermissionClient,
  role: Role,
  path: string,
) {
  try {
    const { data, error } = await (supabase
      .from("pos_role_permissions")
      .select("role,scope,target,action,allowed") as PromiseLike<{
      data: PermissionEntry[] | null;
      error: unknown;
    }>);

    if (error || !data?.length) {
      if (error) {
        log.warn("rbac.permissions.empty", { error, role, path });
      }
      return canRoleAccessPage(role, path, buildDefaultRolePermissions());
    }

    return canRoleAccessPage(role, path, normalizeRolePermissions(data));
  } catch (error) {
    log.error("rbac.permissions.load.failed", { error, role, path });
    return canRoleAccessPage(role, path, buildDefaultRolePermissions());
  }
}
