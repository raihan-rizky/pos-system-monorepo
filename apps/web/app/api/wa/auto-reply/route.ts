import { NextResponse } from "next/server";
import { getWahaConfig, isWaConfigured } from "@/lib/whatsapp";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { z } from "zod";

export const dynamic = "force-dynamic";

const toggleAutoReplySchema = z.object({
  enable: z.boolean(),
});

export async function GET() {
  try {
    await requirePermission("whatsapp", "read");
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    return NextResponse.json({ message: "Internal error" }, { status: 500 });
  }

  if (!isWaConfigured()) {
    return NextResponse.json(
      { message: "WAHA is not configured." },
      { status: 503 },
    );
  }

  try {
    const { baseUrl, apiKey, session, webhookUrl } = getWahaConfig();
    const url = `${baseUrl}/api/sessions/${session}`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(apiKey ? { "X-Api-Key": apiKey } : {}),
      },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`WAHA sessions API error: ${res.statusText}`);
    }

    const data = await res.json();
    const webhooks = data.config?.webhooks || [];
    
    // Consider AI toggle as ON if there is ANY webhook active in WAHA.
    // This prevents the case where an old webhook is active but the UI says Passive.
    const isAutoReplyOn = webhooks.length > 0;

    return NextResponse.json({ isAutoReplyOn });
  } catch (error: any) {
    console.error(`[WA/AutoReply] ❌ Error GET:`, error.message);
    return NextResponse.json(
      { message: "Failed to fetch auto-reply status" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    await requirePermission("whatsapp", "update");
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    return NextResponse.json({ message: "Internal error" }, { status: 500 });
  }

  if (!isWaConfigured()) {
    return NextResponse.json(
      { message: "WAHA is not configured." },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();
    const parsed = toggleAutoReplySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const { enable } = parsed.data;

    const { baseUrl, apiKey, session, webhookUrl } = getWahaConfig();
    const url = `${baseUrl}/api/sessions/${session}`;

    // Fetch current session config first so we don't overwrite other settings
    const getRes = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(apiKey ? { "X-Api-Key": apiKey } : {}),
      },
      cache: "no-store",
    });

    if (!getRes.ok) {
      throw new Error(
        `Failed to fetch current session config: ${getRes.statusText}`,
      );
    }

    const currentData = await getRes.json();
    const currentConfig = currentData.config || {};

    const webhooks = enable
      ? [
          {
            url: `${webhookUrl}/webhook`,
            events: ["message", "message.any", "state.change", "message.ack"],
          },
        ]
      : [];

    const payload = {
      ...currentData,
      config: {
        ...currentConfig,
        noweb: {
          ...(currentConfig.noweb || {}),
          store: {
            ...(currentConfig.noweb?.store || {}),
            enabled: true,
            fullSync: true,
            full_sync: true,
          },
        },
        webhooks,
      },
    };

    console.log(`[WA/AutoReply] PUT webhooks enable=${enable}`);

    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(apiKey ? { "X-Api-Key": apiKey } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(
        `[WA/AutoReply] ❌ WAHA returned ${res.status}: ${errorText}`,
      );
      throw new Error(`WAHA sessions API error: ${res.statusText}`);
    }

    return NextResponse.json({ success: true, isAutoReplyOn: enable });
  } catch (error: any) {
    console.error(`[WA/AutoReply] ❌ Error PUT:`, error.message);
    return NextResponse.json(
      { message: "Failed to update auto-reply status" },
      { status: 500 },
    );
  }
}
