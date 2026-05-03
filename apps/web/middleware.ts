import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // TODO: Implement Supabase auth guard
  // For now, allow all requests
  return NextResponse.next();
}

export const config = {
  // Disabled — no auth guard yet. Re-enable when Supabase auth is implemented.
  // The empty matcher ensures Next.js never invokes this middleware,
  // eliminating ~20-50ms overhead on every client-side navigation.
  matcher: [],
};
