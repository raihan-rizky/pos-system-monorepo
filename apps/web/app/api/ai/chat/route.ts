import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AssistantService } from "@/features/ai-assistant/services/assistant-service";
import { parseFastPathIntentAllowlist } from "@/features/ai-assistant/services/assistant-intent-router";
import type { UserRole } from "@/features/ai-assistant/types/assistant";
import { getCurrentUser } from "@/lib/rbac/guard";
import { getFreshGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import { getLogger } from "@/lib/logger";
import { captureException } from "@/lib/error-boundary";
import { unifiedConfig } from "@/lib/config/unifiedConfig";

// Force dynamic rendering — SSE streams must never be statically cached or buffered.
export const dynamic = "force-dynamic";

const log = getLogger("api:ai:chat");

const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_MESSAGES = 100;
const MAX_MESSAGE_CHARACTERS = 2_000;

class ChatRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const chatRequestSchema = z.object({
  messages: z.array(
    z.discriminatedUnion("role", [
      z.object({
        role: z.literal("user"),
        content: z.string().min(1).max(MAX_MESSAGE_CHARACTERS),
      }),
      z.object({
        role: z.literal("assistant"),
        content: z.string().min(1).max(10_000), // Assistant messages can be longer
      }),
    ])
  ).min(1).max(MAX_MESSAGES),
  pageContext: z
    .object({
      page: z.string().min(1).max(200),
      productId: z.string().max(100).optional(),
      customerId: z.string().max(100).optional(),
      supplierId: z.string().max(100).optional(),
    })
    .optional(),
});

async function readRequestBody(req: NextRequest) {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new ChatRequestError(413, "Request AI terlalu besar. Mulai chat baru atau pendekkan pesan.");
  }

  const raw = await req.text();
  const requestBytes = new TextEncoder().encode(raw).byteLength;
  if (requestBytes > MAX_REQUEST_BYTES) {
    throw new ChatRequestError(413, "Request AI terlalu besar. Mulai chat baru atau pendekkan pesan.");
  }

  try {
    return { body: JSON.parse(raw) as unknown, requestBytes };
  } catch {
    throw new ChatRequestError(400, "Request AI bukan JSON yang valid.");
  }
}

async function timed<T>(operation: () => Promise<T>) {
  const startedAt = Date.now();
  const value = await operation();
  return { value, durationMs: Date.now() - startedAt };
}

function getNebiusConfig() {
  const apiKey = unifiedConfig.ai.nebiusApiKey;
  if (!apiKey) {
    throw new Error("NEBIUS_API_KEY is not configured. Add it to apps/web/.env.local and restart the dev server.");
  }

  const model = unifiedConfig.ai.nebiusModel;
  if (!model) {
    throw new Error("NEBIUS_MODEL is not configured. Add it to apps/web/.env.local and restart the dev server.");
  }

  return { apiKey, model };
}

export async function POST(req: NextRequest) {
  const requestStartedAt = Date.now();
  const requestId = req.headers.get("x-request-id") ?? undefined;
  const requestLog = log.child({ requestId, method: "POST", path: "/api/ai/chat" });
  requestLog.info("assistant.http.received", {
    declaredBytes: Number(req.headers.get("content-length")) || undefined,
  });
  try {
    requestLog.info("assistant.http.admission.started");
    const [auth, parsedBody] = await Promise.all([
      timed(() => getCurrentUser()),
      timed(() => readRequestBody(req)),
    ]);
    const user = auth.value;
    requestLog.info("assistant.http.admission.completed", {
      authenticated: Boolean(user),
      active: Boolean(user?.isActive),
      authDurationMs: auth.durationMs,
      bodyParseDurationMs: parsedBody.durationMs,
      requestBytes: parsedBody.value.requestBytes,
    });
    if (!user || !user.isActive) {
      requestLog.info("assistant.http.rejected", { status: 401, reason: "unauthorized" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const validationStartedAt = Date.now();
    const validation = chatRequestSchema.safeParse(parsedBody.value.body);
    const validationDurationMs = Date.now() - validationStartedAt;
    if (!validation.success) {
      requestLog.info("assistant.http.rejected", {
        status: 400,
        reason: "schema_validation",
        validationDurationMs,
        issueCount: validation.error.issues.length,
      });
      return NextResponse.json({ error: "Invalid request", details: validation.error.issues }, { status: 400 });
    }
    requestLog.info("assistant.http.validation.completed", {
      validationDurationMs,
      messageCount: validation.data.messages.length,
      hasPageContext: Boolean(validation.data.pageContext),
    });

    let rolePermissions: Awaited<ReturnType<typeof getFreshGlobalRolePermissions>>;
    let permissionLoadDurationMs = 0;
    try {
      const permissions = await timed(() => getFreshGlobalRolePermissions());
      rolePermissions = permissions.value;
      permissionLoadDurationMs = permissions.durationMs;
      requestLog.info("assistant.http.permissions.loaded", {
        permissionLoadDurationMs,
      });
    } catch (error) {
      requestLog.error("assistant.http.permissions.failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json(
        { error: "Maaf, akses AI belum bisa diverifikasi. Silakan coba lagi sebentar lagi." },
        { status: 503 },
      );
    }

    const { apiKey, model } = getNebiusConfig();
    const fastPathIntents = parseFastPathIntentAllowlist(unifiedConfig.ai.fastPathIntents);
    requestLog.info("assistant.http.service.initialized", {
      model,
      fastPathIntentCount: fastPathIntents.size,
    });
    const service = new AssistantService({
      apiKey,
      model,
      fastPathIntents,
    });

    const response = service.toResponseStream({
      role: user.role as UserRole,
      storeId: user.storeId,
      messages: validation.data.messages,
      pageContext: validation.data.pageContext,
      signal: req.signal,
      rolePermissions,
      telemetry: {
        requestId,
        requestStartedAt,
        authDurationMs: auth.durationMs,
        bodyParseDurationMs: parsedBody.durationMs,
        validationDurationMs: validationDurationMs + permissionLoadDurationMs,
        requestBytes: parsedBody.value.requestBytes,
      },
    });
    requestLog.info("assistant.http.stream.created", {
      status: response.status,
      totalSetupDurationMs: Date.now() - requestStartedAt,
    });
    return response;
  } catch (error) {
    if (error instanceof ChatRequestError) {
      requestLog.info("assistant.http.rejected", {
        status: error.status,
        reason: error.status === 413 ? "request_too_large" : "invalid_json",
        totalDurationMs: Date.now() - requestStartedAt,
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    captureException(error, { requestId, route: "/api/ai/chat" });
    requestLog.error("assistant.http.failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      totalDurationMs: Date.now() - requestStartedAt,
    });
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
