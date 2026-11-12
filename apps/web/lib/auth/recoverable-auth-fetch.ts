import { parseRetryAfter } from "./session-failure";

function authVerificationRequest(input: RequestInfo | URL, init?: RequestInit): "refresh" | "user" | null {
  const request = typeof input === "string" || input instanceof URL ? undefined : input;
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  try {
    const url = new URL(request?.url ?? String(input));
    if (method === "GET" && url.pathname.endsWith("/auth/v1/user")) return "user";
    if (method === "POST" && url.pathname.endsWith("/auth/v1/token")
        && url.searchParams.get("grant_type") === "refresh_token") {
      return "refresh";
    }
  } catch { /* The fetch adapter also handles requests unrelated to auth. */ }
  return null;
}

function verificationUnavailable(retryInMs: number, status = 503) {
  return new Response('{"error_code":"session_verification_unavailable"}', {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Retry-After": String(Math.ceil(retryInMs / 1_000) || 2),
    },
  });
}

export function createRecoverableAuthFetch(
  baseFetch: typeof fetch,
  options: { onRetryAfter?: (deadline: number) => void; onServerRefreshFailure?: () => void } = {},
): typeof fetch {
  let refreshRetryAt = 0;
  return async (input, init) => {
    const kind = authVerificationRequest(input, init);
    if (kind === "refresh" && refreshRetryAt > Date.now()) {
      return verificationUnavailable(refreshRetryAt - Date.now());
    }

    const response = await baseFetch(input, init).catch(error => {
      if (kind !== "refresh" || !options.onServerRefreshFailure) throw error;
      return verificationUnavailable(0);
    });
    if (!kind) return response;
    if (response.status === 409) {
      if (kind !== "refresh") return response;
      const body = await response.clone().json().catch(() => null);
      if (body?.error_code !== "conflict" && body?.code !== "conflict") return response;
    } else if (response.status !== 429 && (response.status < 500 || response.status > 599)) {
      return response;
    }

    const delay = parseRetryAfter(response.headers.get("Retry-After")) || (response.status === 429 ? 2_000 : 0);
    if (delay) {
      const deadline = Date.now() + delay;
      // The SDK retries 503 but does not read Retry-After. Keep its early retries local.
      if (kind === "refresh") refreshRetryAt = deadline;
      options.onRetryAfter?.(deadline);
    }
    if (kind === "refresh" && options.onServerRefreshFailure) {
      // Auth JS retries 503 for up to 30 seconds. This request-scoped server
      // client can stop at a 500 because middleware suppresses its cookie cleanup.
      options.onServerRefreshFailure();
      return verificationUnavailable(delay, 500);
    }
    return verificationUnavailable(delay);
  };
}
