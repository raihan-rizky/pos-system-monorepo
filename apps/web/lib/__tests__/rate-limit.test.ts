import { afterEach, describe, expect, it } from "vitest";

import {
  checkRateLimit,
  getRateLimitKey,
  resetRateLimitsForTests,
} from "@/lib/rate-limit";

describe("rate limit", () => {
  afterEach(() => {
    resetRateLimitsForTests();
  });

  it("blocks requests after the route window limit is exhausted", () => {
    const config = {
      namespace: "test:route",
      key: "127.0.0.1",
      limit: 2,
      windowMs: 60_000,
    };

    expect(checkRateLimit(config, 1_000)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(checkRateLimit(config, 2_000)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(checkRateLimit(config, 3_000)).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 58,
    });
  });

  it("uses independent buckets per route namespace and client", () => {
    const base = { limit: 1, windowMs: 60_000 };

    expect(checkRateLimit({ ...base, namespace: "a", key: "ip-1" }, 1_000).allowed).toBe(true);
    expect(checkRateLimit({ ...base, namespace: "a", key: "ip-1" }, 2_000).allowed).toBe(false);
    expect(checkRateLimit({ ...base, namespace: "b", key: "ip-1" }, 3_000).allowed).toBe(true);
    expect(checkRateLimit({ ...base, namespace: "a", key: "ip-2" }, 4_000).allowed).toBe(true);
  });

  it("prefers forwarded client IP headers for request keys", () => {
    const request = new Request("https://pos.example.com/api/ai/chat", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      },
    });

    expect(getRateLimitKey(request)).toBe("203.0.113.10");
  });
});
