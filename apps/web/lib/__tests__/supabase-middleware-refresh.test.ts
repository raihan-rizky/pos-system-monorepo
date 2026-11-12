import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

describe("middleware with the installed Supabase SDK", () => {
  const cookieName = "sb-auth-auth-token";

  function expiredSessionRequest() {
    const session = {
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      expires_at: Math.floor(Date.now() / 1_000) - 1,
    };
    const cookieValue = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
    return new NextRequest("http://localhost/api/auth/permissions", {
      headers: { cookie: `${cookieName}=${cookieValue}` },
    });
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([[429, "60"], [500, "2"]] as const)(
    "sends 503 for refresh status %s before the permission check can time out",
    async (status, retryAfter) => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth.example.test");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
      vi.stubEnv("E2E_AUTH_BYPASS", "0");
      vi.useFakeTimers();
      const request = expiredSessionRequest();
      const refresh = vi.fn(async () => Response.json({ error_code: "temporary" }, {
        status,
        headers: status === 429 ? { "Retry-After": retryAfter } : undefined,
      }));
      vi.stubGlobal("fetch", refresh);

      let response: Awaited<ReturnType<typeof updateSession>> | undefined;
      void updateSession(request).then(result => { response = result; });
      await vi.advanceTimersByTimeAsync(9_999);

      expect(refresh.mock.calls).toHaveLength(1);
      expect(response?.status).toBe(503);
      expect(response?.headers.get("Retry-After")).toBe(retryAfter);
      expect(response?.cookies.get(cookieName)).toBeUndefined();
      expect(request.cookies.get(cookieName)?.value).toContain("base64-");
    },
  );

  it("does not expire the shared auth cookie from a stale API request", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("E2E_AUTH_BYPASS", "0");
    vi.stubGlobal("fetch", async () => Response.json({ error_code: "refresh_token_not_found" }, { status: 400 }));

    const response = await updateSession(expiredSessionRequest());

    expect(response.status).toBe(401);
    expect(response.cookies.get(cookieName)).toBeUndefined();
  });
});
