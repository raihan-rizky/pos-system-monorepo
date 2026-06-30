import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";
import { getLogger } from "@/lib/logger";

function makeRequestId(): string {
  const bytes = new Uint8Array(8);
   
  const c: any = (globalThis as any).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const log = getLogger("middleware", {
    requestId,
    method: request.method,
    path: request.nextUrl.pathname,
  });

  const startedAt = Date.now();
  log.debug("middleware.start");

  let response: Response;
  try {
    response = await updateSession(request);
  } catch (error) {
    log.error("middleware.failed", { error, durationMs: Date.now() - startedAt });
    const fallback = request.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Unable to verify access" }, { status: 503 })
      : new NextResponse("Unable to verify access", { status: 503 });
    fallback.headers.set("x-request-id", requestId);
    return fallback;
  }

  response.headers.set("x-request-id", requestId);
  log.debug("middleware.end", {
    status: response.status,
    durationMs: Date.now() - startedAt,
  });
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json (PWA manifest)
     * - sw.js (Service worker)
     * - api/wa/webhook (WAHA webhook)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|api/wa/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|json)).*)",
  ],
};
