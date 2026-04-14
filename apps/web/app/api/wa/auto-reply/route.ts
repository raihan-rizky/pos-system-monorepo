import { NextResponse } from "next/server";
import { getWahaConfig, isWaConfigured } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isWaConfigured()) {
    return NextResponse.json(
      { message: "WAHA is not configured." },
      { status: 503 },
    );
  }

  try {
    const { baseUrl, apiKey, session } = getWahaConfig();
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
    const isAutoReplyOn = webhooks.some((w: any) =>
      w.url?.includes("chatbot-wa-sand.vercel.app"),
    );

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
  if (!isWaConfigured()) {
    return NextResponse.json(
      { message: "WAHA is not configured." },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();
    const { enable } = body;

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
