import { describe, expect, it } from "vitest";
import {
  isSupabaseAuthCookieName,
  isSupabaseAuthStorageKey,
} from "@/lib/auth/pos-session";

describe("POS auth session cleanup helpers", () => {
  it("matches Supabase auth cookies and storage keys", () => {
    expect(isSupabaseAuthCookieName("sb-project-ref-auth-token")).toBe(true);
    expect(isSupabaseAuthCookieName("sb-project-ref-auth-token.0")).toBe(true);
    expect(isSupabaseAuthCookieName("supabase.auth.token")).toBe(true);
    expect(isSupabaseAuthCookieName("x-pos-role")).toBe(false);
    expect(isSupabaseAuthCookieName("sidebar_collapsed")).toBe(false);
  });

  it("uses the same matcher for Supabase auth storage keys", () => {
    expect(isSupabaseAuthStorageKey("sb-project-ref-auth-token")).toBe(true);
    expect(isSupabaseAuthStorageKey("pos:hide-out-of-stock")).toBe(false);
  });
});
