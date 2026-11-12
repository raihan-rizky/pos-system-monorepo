import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_PAGE, isValidRole } from "@/lib/rbac/permissions";
import type { Role } from "@/lib/rbac/permissions";
import {
  buildDefaultRolePermissions,
  canRoleAccessPage,
  normalizePageTarget,
  PAGE_TARGETS,
} from "@/features/rbac/helpers/rbac-core";
import { getLogger } from "@/lib/logger";
import { signOutCurrentSession } from "@/lib/auth/local-sign-out";
import { createRecoverableAuthFetch } from "@/lib/auth/recoverable-auth-fetch";
import { isTransientAuthFailure, SESSION_VERIFICATION_UNAVAILABLE } from "@/lib/auth/session-failure";

const log = getLogger("supabase-middleware");

const ROLE_COOKIE = "x-pos-role";
const USER_ID_COOKIE = "x-pos-user-id";
const USER_NAME_COOKIE = "x-pos-user-name";
const STORE_ID_COOKIE = "x-pos-store-id";

function getPosIdentityCookieOptions() {
  return {
    path: "/",
    httpOnly: false,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24,
  };
}

function setPosIdentityCookies(
  response: NextResponse,
  role: Role,
  userId: string,
  userName: string,
  storeId: string | null,
) {
  const cookieOptions = getPosIdentityCookieOptions();
  response.cookies.set(ROLE_COOKIE, role, cookieOptions);
  response.cookies.set(USER_ID_COOKIE, userId, cookieOptions);
  response.cookies.set(USER_NAME_COOKIE, userName, cookieOptions);
  response.cookies.set(STORE_ID_COOKIE, storeId ?? "", cookieOptions);
}

function isProtectedPageRequest(pathname: string) {
  return (
    !pathname.startsWith("/api/") &&
    pathname !== "/" &&
    pathname !== "/login" &&
    pathname !== "/access-denied" &&
    !pathname.startsWith("/auth")
  );
}

function withSessionCookies(response: NextResponse, authResponse: NextResponse) {
  for (const cookie of authResponse.cookies.getAll()) {
    response.cookies.set(cookie);
  }
  return response;
}

function authVerificationUnavailable(
  request: NextRequest,
  authResponse: NextResponse,
  retryAt = 0,
) {
  log.warn("auth.verification.unavailable", {
    path: request.nextUrl.pathname,
  });

  const message = SESSION_VERIFICATION_UNAVAILABLE;
  const headers = {
    "Cache-Control": "no-store",
    "Retry-After": String(Math.max(2, Math.ceil((retryAt - Date.now()) / 1_000))),
  };
  const response = request.nextUrl.pathname.startsWith("/api/")
    ? NextResponse.json({ error: message, code: "ServiceUnavailable" }, { status: 503, headers })
    : new NextResponse(
        '<!doctype html><html lang="id"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Akses belum dapat diperiksa</title><body style="font-family:system-ui;max-width:32rem;margin:12vh auto;padding:1.5rem"><h1>Hak akses belum dapat diverifikasi</h1><p>Koneksi sedang bermasalah. Hak akses Anda belum dapat diperiksa. Silakan coba lagi.</p><p><a href="">Coba lagi</a> · <a href="/access-denied">Bantuan akses dan keluar</a></p></body></html>',
        { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } },
      );

  // A refresh may already have rotated cookies before the subsequent user
  // verification request fails. Preserve those cookies on the 503 response so
  // the next request can recover with the newest session credentials.
  return withSessionCookies(response, authResponse);
}

export async function updateSession(request: NextRequest) {
  if (process.env.NODE_ENV !== "production" && process.env.E2E_AUTH_BYPASS === "1") {
    const role = (request.cookies.get(ROLE_COOKIE)?.value || "OWNER") as Role;
    const userId = request.cookies.get(USER_ID_COOKIE)?.value || "e2e-user";
    const userName = request.cookies.get(USER_NAME_COOKIE)?.value || "E2E Owner";
    const storeId = request.cookies.get(STORE_ID_COOKIE)?.value || "store-main";

    request.cookies.set(ROLE_COOKIE, role);
    request.cookies.set(USER_ID_COOKIE, userId);
    request.cookies.set(USER_NAME_COOKIE, userName);
    request.cookies.set(STORE_ID_COOKIE, storeId);

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
    response.cookies.set(STORE_ID_COOKIE, storeId, cookieOptions);

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
  let authRetryAt = 0;
  let preserveAuthCookies = false;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: createRecoverableAuthFetch(fetch, {
          onRetryAfter: deadline => { authRetryAt = deadline; },
          onServerRefreshFailure: () => { preserveAuthCookies = true; },
        }),
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          if (preserveAuthCookies) return;
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
    error: authError,
  } = await supabase.auth.getUser();

  // Supabase keeps the refresh token when a request fails transiently. Do not
  // turn that recoverable state into a logout/redirect by treating user=null
  // as a missing session. A later request can verify the same session again.
  if (isTransientAuthFailure(authError)) {
    return authVerificationUnavailable(request, supabaseResponse, authRetryAt);
  }

  // Not authenticated
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      log.debug("unauthenticated.api", { path: request.nextUrl.pathname });
      // A delayed request may refer to the session that preceded a new login.
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
      const { data: posUser, error: identityError } = username
        ? await supabase
            .from("pos_users")
            .select("id, name, role, storeId, isActive")
            .eq("username", username)
            .maybeSingle()
        : { data: null, error: null };

      if (identityError) return authVerificationUnavailable(request, supabaseResponse);

      if (posUser && posUser.isActive && isValidRole(posUser.role)) {
        role = posUser.role as Role;
        const hadFreshIdentityCookies =
          request.cookies.get(ROLE_COOKIE)?.value === role &&
          request.cookies.get(USER_ID_COOKIE)?.value === posUser.id &&
          request.cookies.get(STORE_ID_COOKIE)?.value === (posUser.storeId ?? "");

        request.cookies.set(ROLE_COOKIE, role);
        request.cookies.set(USER_ID_COOKIE, posUser.id);
        request.cookies.set(USER_NAME_COOKIE, posUser.name);
        request.cookies.set(STORE_ID_COOKIE, posUser.storeId ?? "");
        setPosIdentityCookies(supabaseResponse, role, posUser.id, posUser.name, posUser.storeId ?? null);
        log.info("role.resolved", { username, role });

        if (isProtectedPageRequest(request.nextUrl.pathname)) {
          const canAccess = await canAccessPageWithConfiguredPermissions(
            supabase,
            role,
            request.nextUrl.pathname,
          );

          if (!canAccess) {
            log.info("page.access.denied", { role, path: request.nextUrl.pathname });
            let destination = "/access-denied";
            const candidates = [...new Set([DEFAULT_PAGE[role], ...PAGE_TARGETS])];
            for (const candidate of candidates) {
              if (candidate === normalizePageTarget(request.nextUrl.pathname)) continue;
              if (await canAccessPageWithConfiguredPermissions(supabase, role, candidate)) {
                destination = candidate;
                break;
              }
            }
            const url = request.nextUrl.clone();
            url.pathname = destination;
            url.search = "";
            return withSessionCookies(NextResponse.redirect(url), supabaseResponse);
          }

          if (!hadFreshIdentityCookies) {
            return withSessionCookies(NextResponse.redirect(request.nextUrl), supabaseResponse);
          }

          // Cookies are already fresh on this request, so no redirect is
          // needed. Missing or stale cookies are handled once above.
        }
      } else {
        log.warn("user.inactive_or_missing", { username, hasPosUser: Boolean(posUser) });
        if (request.nextUrl.pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (request.nextUrl.pathname === "/login") {
          await signOutCurrentSession(supabase);
          return supabaseResponse;
        }

        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("error", "Account not found or deactivated");
        return NextResponse.redirect(url);
      }
    } catch {
      return authVerificationUnavailable(request, supabaseResponse, authRetryAt);
    }

  }

  return supabaseResponse;
}

type PermissionClient = {
  from: (table: string) => {
    select: (columns: string) => any;
  };
};

async function canAccessPageWithConfiguredPermissions(
  supabase: PermissionClient,
  role: Role,
  path: string,
) {
  if (role === "OWNER") return true;
  try {
    const pageTarget = normalizePageTarget(path);
    // If it's an unknown target, reject immediately or fallback to default?
    // Actually, fallback to default handles unknown targets (returns false).

    const { data, error } = await (supabase
      .from("pos_role_permissions")
      .select("allowed")
      .eq("role", role)
      .eq("scope", "page")
      .eq("target", pageTarget)
      .eq("action", "access")
      .maybeSingle() as PromiseLike<{
      data: { allowed: boolean } | null;
      error: unknown;
    }>);

    if (error) {
      log.warn("rbac.permissions.query.error", { error, role, path });
      throw new Error("Hak akses belum dapat diverifikasi");
    }

    if (data !== null) {
      return data.allowed;
    }

    return canRoleAccessPage(role, path, buildDefaultRolePermissions());
  } catch (error) {
    log.error("rbac.permissions.load.failed", { error, role, path });
    throw error;
  }
}
