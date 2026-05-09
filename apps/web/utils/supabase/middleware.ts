import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccessPage, DEFAULT_PAGE, isValidRole } from "@/lib/rbac/permissions";
import type { Role } from "@/lib/rbac/permissions";

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
      !canAccessPage(role, request.nextUrl.pathname)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = DEFAULT_PAGE[role];
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

  // ── Not authenticated ──
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Redirect to login
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // ── Authenticated: resolve role ──
  if (user) {
    let role = request.cookies.get(ROLE_COOKIE)?.value as Role | undefined;

    // If no role cookie, resolve from DB and set it
    if (!role || !isValidRole(role)) {
      try {
        // Use Supabase PostgREST instead of Prisma to keep the Edge
        // Function bundle under Vercel's 1 MB limit.
        const username = user.email?.split("@")[0];
        const { data: posUser } = username
          ? await supabase
              .from("pos_users")
              .select("id, name, role, isActive")
              .eq("username", username)
              .maybeSingle()
          : { data: null };

        if (posUser && posUser.isActive) {
          role = posUser.role as Role;

          // Set role cookie on the response
          const cookieOptions = {
            path: "/",
            httpOnly: false, // Needs to be readable by frontend RoleProvider
            sameSite: "strict" as const,
            secure: process.env.NODE_ENV === "production",
            maxAge: 60 * 60 * 24, // 24 hours
          };
          supabaseResponse.cookies.set(ROLE_COOKIE, role, cookieOptions);
          supabaseResponse.cookies.set(USER_ID_COOKIE, posUser.id, cookieOptions);
          supabaseResponse.cookies.set(USER_NAME_COOKIE, posUser.name, cookieOptions);
        } else {
          // User exists in Supabase but not in POS system or deactivated
          if (request.nextUrl.pathname.startsWith("/api/")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
          }

          if (request.nextUrl.pathname === "/login") {
            // Already on login page, sign out so they don't get stuck in a loop
            await supabase.auth.signOut();
            return supabaseResponse;
          }

          const url = request.nextUrl.clone();
          url.pathname = "/login";
          // append a query param so the login page can show an error
          url.searchParams.set("error", "Account not found or deactivated");
          return NextResponse.redirect(url);
        }
      } catch (error) {
        if (request.nextUrl.pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Unable to verify access" }, { status: 503 });
        }
        console.error("[Middleware] Failed to resolve user role:", error);
        // On DB error, allow request through — API guards will catch it
        return supabaseResponse;
      }
    }

    // ── Page-level access check (skip for API routes — handled by requireRole) ──
    if (role && !request.nextUrl.pathname.startsWith("/api/")) {
      const pathname = request.nextUrl.pathname;

      // Skip access check for login, auth, and root pages
      if (
        pathname !== "/" &&
        pathname !== "/login" &&
        !pathname.startsWith("/auth")
      ) {
        if (!canAccessPage(role, pathname)) {
          // Redirect to role's default page
          const url = request.nextUrl.clone();
          url.pathname = DEFAULT_PAGE[role];
          return NextResponse.redirect(url);
        }
      }
    }
  }

  return supabaseResponse;
}
