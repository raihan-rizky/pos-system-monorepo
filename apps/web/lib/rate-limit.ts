import { NextResponse } from "next/server";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export type RateLimitConfig = {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

const buckets = new Map<string, RateLimitBucket>();

function bucketId(namespace: string, key: string) {
  return `${namespace}:${key}`;
}

function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkRateLimit(
  config: RateLimitConfig,
  now = Date.now(),
): RateLimitResult {
  pruneExpiredBuckets(now);

  const id = bucketId(config.namespace, config.key);
  const existing = buckets.get(id);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + config.windowMs };

  if (bucket.count >= config.limit) {
    buckets.set(id, bucket);
    return {
      allowed: false,
      limit: config.limit,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  buckets.set(id, bucket);

  return {
    allowed: true,
    limit: config.limit,
    remaining: Math.max(0, config.limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: 0,
  };
}

export function getRateLimitKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const [clientIp] = forwardedFor.split(",");
    if (clientIp?.trim()) return clientIp.trim();
  }

  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function rateLimitHeaders(result: RateLimitResult) {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}

export function rateLimitResponse(result: RateLimitResult) {
  return NextResponse.json(
    { message: "Terlalu banyak permintaan. Coba lagi sebentar lagi." },
    {
      status: 429,
      headers: rateLimitHeaders(result),
    },
  );
}

export function enforceRateLimit(
  request: Request,
  config: Omit<RateLimitConfig, "key"> & { key?: string },
) {
  const result = checkRateLimit({
    ...config,
    key: config.key ?? getRateLimitKey(request),
  });

  return result.allowed ? null : rateLimitResponse(result);
}

export function resetRateLimitsForTests() {
  buckets.clear();
}
