import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  POS_IDENTITY_COOKIE_NAMES,
  isSupabaseAuthCookieName,
} from "@/lib/auth/pos-session";

export async function POST() {
  const cookieStore = await cookies();
  const response = NextResponse.json({ ok: true });
  const namesToClear = new Set<string>(POS_IDENTITY_COOKIE_NAMES);

  for (const cookie of cookieStore.getAll()) {
    if (isSupabaseAuthCookieName(cookie.name)) {
      namesToClear.add(cookie.name);
    }
  }

  for (const name of namesToClear) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
  }

  return response;
}
