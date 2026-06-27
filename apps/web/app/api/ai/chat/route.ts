import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AssistantService } from "@/features/ai-assistant/services/assistant-service";
import type { UserRole } from "@/features/ai-assistant/types/assistant";
import { getCurrentUser } from "@/lib/rbac/guard";

// Force dynamic rendering — SSE streams must never be statically cached or buffered.
export const dynamic = "force-dynamic";

const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1),
    })
  ),
  pageContext: z
    .object({
      page: z.string(),
      productId: z.string().optional(),
      customerId: z.string().optional(),
      supplierId: z.string().optional(),
    })
    .optional(),
});

function getNebiusConfig() {
  const apiKey = process.env.NEBIUS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("NEBIUS_API_KEY is not configured. Add it to apps/web/.env.local and restart the dev server.");
  }

  const model = process.env.NEBIUS_MODEL?.trim();
  if (!model) {
    throw new Error("NEBIUS_MODEL is not configured. Add it to apps/web/.env.local and restart the dev server.");
  }

  return { apiKey, model };
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const validation = chatRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: "Invalid request", details: validation.error.issues }, { status: 400 });
    }

    const { apiKey, model } = getNebiusConfig();
    const service = new AssistantService({ apiKey, model });

    return service.toResponseStream({
      role: user.role as UserRole,
      storeId: user.storeId,
      messages: validation.data.messages,
      pageContext: validation.data.pageContext,
      signal: req.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
