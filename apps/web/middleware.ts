import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Minimum auth guard — reads the Supabase session cookie and redirects
 * unauthenticated requests to /login.
 *
 * Supabase stores the session in a cookie named:
 *   sb-<project-ref>-auth-token
 * The anon key JWT contains the project ref as the `ref` claim, but for the
 * middleware we only need to know IF any Supabase auth cookie is present —
 * the actual session validation happens server-side in the API routes when
 * needed. This is the "gate" layer, not the "validation" layer.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for any Supabase auth cookie (sb-*-auth-token)
  const hasSession = [...request.cookies.getAll()].some(
    (cookie) =>
      cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"),
  );

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    // Preserve the original destination so we can redirect back after login
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Protect all routes EXCEPT:
     * - /login  (the login page itself)
     * - /_next  (Next.js internals)
     * - /api/wa/webhook (WAHA webhook — called by external service, no browser session)
     * - Static files (images, fonts, favicon, etc.)
     */
    "/((?!login|_next/static|_next/image|favicon.ico|manifest.json|sw.js|api/wa/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|json)).*)",
  ],
};
