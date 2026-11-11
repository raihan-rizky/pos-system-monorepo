import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createRecoverableAuthFetch } from "@/lib/auth/recoverable-auth-fetch";

describe("recoverable auth transport", () => {
  const origin = "https://auth.example.test/supabase";
  const refreshUrl = origin + "/auth/v1/token?grant_type=refresh_token";
  const conflict = () => Response.json({ error_code: "conflict" }, { status: 409 });

  it.each([
    ["conflict", 409, "conflict", 0],
    ["temporary server failure", 500, "unexpected_failure", 0],
    ["rate limit", 429, "over_request_rate_limit", 1],
  ] as const)("lets the real SDK retry a %s and save the rotated session", async (_label, status, code, retryAfter) => {
    const storage = new Map<string, string>();
    const session = {
      access_token: "synthetic-access",
      refresh_token: "synthetic-refresh",
      expires_in: 3600,
      token_type: "bearer",
      user: { id: "operator-1", aud: "authenticated" },
    };
    const transport = vi.fn<typeof fetch>().mockImplementationOnce(async () => Response.json({ error_code: code }, {
      status, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
    }))
      .mockImplementationOnce(async () => Response.json(session));
    const sdk = createClient(origin, "test-anon-key", {
      auth: {
        storageKey: "test-session",
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: {
          getItem: (key) => storage.get(key) ?? null,
          setItem: (key, value) => { storage.set(key, value); },
          removeItem: (key) => { storage.delete(key); },
        },
      },
      global: { fetch: createRecoverableAuthFetch(transport) },
    });

    vi.useFakeTimers();
    try {
      const refresh = sdk.auth.refreshSession({ refresh_token: "synthetic-old" });
      if (retryAfter) {
        await vi.advanceTimersByTimeAsync(999);
        expect(transport).toHaveBeenCalledTimes(1);
      }
      await vi.advanceTimersByTimeAsync(2_000);
      const { data, error } = await refresh;
      expect(error).toBeNull();
      expect(data.session?.refresh_token).toBe("synthetic-refresh");
      expect(storage.get("test-session")).toContain("synthetic-refresh");
      expect(transport).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  it("keeps refresh rate limits retryable and preserves Retry-After", async () => {
    const response = Response.json({ error_code: "over_request_rate_limit" }, {
      status: 429, headers: { "Retry-After": "8" },
    });
    const fetcher = createRecoverableAuthFetch(async () => response);
    const result = await fetcher(new Request(refreshUrl, { method: "POST" }));
    expect(result.status).toBe(503);
    expect(result.headers.get("Retry-After")).toBe("8");
  });

  it("leaves business conflicts, password sign-in and unknown auth errors alone", async () => {
    const fetcher = createRecoverableAuthFetch(async () => conflict());
    expect((await fetcher(origin + "/rest/v1/transactions", { method: "POST" })).status).toBe(409);
    expect((await fetcher(origin + "/auth/v1/token?grant_type=password", { method: "POST" })).status).toBe(409);
    const rejected = createRecoverableAuthFetch(async () => Response.json({ error_code: "refresh_token_not_found" }, { status: 400 }));
    expect((await rejected(refreshUrl, { method: "POST" })).status).toBe(400);
  });
});
