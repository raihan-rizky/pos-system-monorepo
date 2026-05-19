import { NextResponse } from "next/server";
import { getLogger, type Logger } from "./logger";

export type RouteContext = { params?: Record<string, string | string[]> } | undefined;

export type RouteHandler<C extends RouteContext = RouteContext> = (
  request: Request,
  context: C,
  log: Logger,
) => Promise<Response> | Response;

function makeRequestId(): string {
  // 16 hex chars, sufficient for correlating one request''s logs.
  const bytes = new Uint8Array(8);
   
  const c: any = (globalThis as any).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function withRequestLogging<C extends RouteContext = RouteContext>(
  name: string,
  handler: RouteHandler<C>,
): (request: Request, context: C) => Promise<Response> {
  return async (request, context) => {
    const requestId =
      request.headers.get("x-request-id") || makeRequestId();
    const url = new URL(request.url);
    const log = getLogger(`api:${name}`, {
      requestId,
      method: request.method,
      path: url.pathname,
    });

    const startedAt = Date.now();
    log.info("request.start", {
      query: Object.fromEntries(url.searchParams.entries()),
    });

    try {
      const response = await handler(request, context, log);
      const durationMs = Date.now() - startedAt;
      response.headers.set("x-request-id", requestId);
      log.info("request.end", {
        status: response.status,
        durationMs,
      });
      return response;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      log.error("request.failed", { error, durationMs });
      const res = NextResponse.json(
        { message: "Internal server error" },
        { status: 500 },
      );
      res.headers.set("x-request-id", requestId);
      return res;
    }
  };
}
