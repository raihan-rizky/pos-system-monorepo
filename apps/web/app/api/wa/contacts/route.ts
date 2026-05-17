import { NextResponse } from "next/server";
import { getWahaConfig, isWaConfigured } from "@/lib/whatsapp";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/wa/contacts
 * Returns a list of all WhatsApp chats from WAHA, ordered by most recent.
 * Fetches from /api/{session}/chats/overview?merge=true&limit=20 which includes
 * contact name, profile picture, and last message in a single call.
 */
export async function GET() {
  const startTime = performance.now();
  console.log(`[WA/Contacts] GET request received`);

  if (!isWaConfigured()) {
    return NextResponse.json(
      { message: "WAHA is not configured." },
      { status: 503 },
    );
  }

  try {
    await requirePermission("whatsapp", "read");
    const { baseUrl, apiKey, session } = getWahaConfig();
    const url = `${baseUrl}/api/${session}/chats/overview?merge=true&limit=20`;

    console.log(`[WA/Contacts] Fetching from: ${url}`);

    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(apiKey ? { "X-Api-Key": apiKey } : {}),
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[WA/Contacts] ❌ WAHA returned ${res.status}: ${errorText}`);
      throw new Error(`WAHA overview API error: ${res.statusText}`);
    }

    const chats: any[] = await res.json();

    const contacts = chats
      .filter((chat: any) => {
        // Fix logic penentuan ID string
        let idString =
          chat.id?._serialized || (typeof chat.id === "string" ? chat.id : "");
        if (!idString) return false;

        if (idString.endsWith("@s.whatsapp.net")) {
          idString = idString.replace("@s.whatsapp.net", "@c.us");
        }
        return (
          (idString.endsWith("@c.us") || idString.endsWith("@lid")) &&
          idString !== "0@c.us"
        );
      })
      .map((chat: any) => {
        let idString =
          chat.id?._serialized || (typeof chat.id === "string" ? chat.id : "");
        if (idString.endsWith("@s.whatsapp.net")) {
          idString = idString.replace("@s.whatsapp.net", "@c.us");
        }

        const phoneStr = idString.split("@")[0];

        // Extract push name from lastMessage._data (overview endpoint returns name: null)
        const pushName =
          chat.lastMessage?._data?.pushName ||
          chat.lastMessage?.pushName ||
          null;

        // Name resolution: overview endpoint often returns name: null, fall back to pushName or phone
        let role = "user";
        let content = "";
        let timestamp = chat.timestamp;
        let hasMedia = false;

        if (chat.lastMessage) {
          const lm = chat.lastMessage;
          const data = lm._data || lm;

          // hasMedia is a top-level field in the overview response
          hasMedia = lm.hasMedia === true;

          const isFromMe =
            lm.fromMe ?? data.key?.fromMe ?? data.id?.fromMe ?? false;
          role = isFromMe ? "assistant" : "user";

          // body is top-level in overview; also check deep _data paths
          content =
            lm.body ||
            data.message?.conversation ||
            data.message?.extendedTextMessage?.text ||
            "";

          // timestamp is top-level in overview response
          timestamp = lm.timestamp ?? data.messageTimestamp ?? data.t;
        }

        let tsMs = Date.now();
        if (timestamp) {
          tsMs = timestamp < 1e11 ? timestamp * 1000 : timestamp;
        }

        return {
          id: idString,
          phone: phoneStr,
          // overview returns name: null, so fall back through pushName → phone
          name: chat.name || pushName || chat.pushname || phoneStr,
          // picture is a direct CDN URL (e.g. pps.whatsapp.net) when available
          picture: chat.picture || null,
          role,
          content: hasMedia ? "📷 Media" : content,
          created_at: new Date(tsMs).toISOString(),
          image_url: hasMedia ? "media" : null,
        };
      });

    contacts.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const duration = (performance.now() - startTime).toFixed(1);
    console.log(`[WA/Contacts] ✅ Success in ${duration}ms`);

    return NextResponse.json({ data: contacts });
  } catch (error: any) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error(`[WA/Contacts] ❌ Error:`, error.message);
    return NextResponse.json(
      { message: "Failed to fetch WA contacts" },
      { status: 500 },
    );
  }
}
