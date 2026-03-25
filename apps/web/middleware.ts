import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // TODO: Implement Supabase auth guard
  // For now, allow all requests
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files, api, and _next
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
};
