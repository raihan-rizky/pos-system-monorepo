import { NextResponse } from "next/server";
import {
  getWahaChatMessages,
  getWahaChats,
  isWaConfigured,
  sendWaTextMessage,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * GET /api/wa/messages?chatId=156500...89@lid
 * Fetches message history for a specific chat from WAHA.
 */
export async function GET(request: Request) {
  const startTime = performance.now();
  const { searchParams } = new URL(request.url);
  const phoneParam = searchParams.get("phone");
  const chatIdParam = searchParams.get("chatId");
  console.log(
    `[WA/Messages] GET request — phone=${phoneParam}, chatId=${chatIdParam}`,
  );

  if (!isWaConfigured()) {
    console.warn(`[WA/Messages] WAHA not configured — returning 503`);
    return NextResponse.json(
      { message: "WAHA is not configured" },
      { status: 503 },
    );
  }

  try {
    const phone = phoneParam;

    const targetId = chatIdParam || phone;

    if (!targetId || targetId === "0") {
      console.warn(`[WA/Messages] Bad request — missing or invalid targetId`);
      return NextResponse.json(
        { message: "Valid Phone or ChatId parameter is required" },
        { status: 400 },
      );
    }

    let chatId = targetId;

    // If frontend sends an old format (no suffix), auto-discover it from the contacts list
    if (!chatId.includes("@")) {
      console.log(
        `[WA/Messages] chatId has no suffix, auto-discovering from contacts...`,
      );
      try {
        const chats = await getWahaChats();
        const match = chats.find((c: any) => {
          let id = c.id?._serialized || c.id || "";
          if (id.endsWith("@s.whatsapp.net")) {
            id = id.replace("@s.whatsapp.net", "@c.us");
          }
          return id.split("@")[0] === chatId;
        });
        if (match) {
          chatId = match.id?._serialized || match.id;
          if (chatId.endsWith("@s.whatsapp.net")) {
            chatId = chatId.replace("@s.whatsapp.net", "@c.us");
          }
          console.log(`[WA/Messages] Resolved chatId to: ${chatId}`);
        } else {
          chatId = `${chatId}@c.us`; // Fallback
          console.log(
            `[WA/Messages] No match found, falling back to: ${chatId}`,
          );
        }
      } catch (e) {
        chatId = `${chatId}@c.us`; // Fallback if WAHA chats API fails
        console.warn(
          `[WA/Messages] Chats API failed during discovery, falling back to: ${chatId}`,
        );
      }
    }

    let wahaMessages: any[] = [];
    try {
      console.log(`[WA/Messages] Fetching messages for chatId=${chatId}...`);
      wahaMessages = await getWahaChatMessages(chatId, 100, true); // Pastiin downloadMedia = true
      console.log(
        `[WA/Messages] Direct fetch returned ${wahaMessages?.length || 0} messages`,
      );

      // If WEBJS succeeds but returns an empty array due to sync delays for brand new numbers,
      // intentionally throw an error to force the fallback mechanism to extract the lastMessage.
      if (!wahaMessages || wahaMessages.length === 0) {
        console.log(
          `[WA/Messages] Empty result from direct fetch, triggering fallback...`,
        );
        throw new Error(
          "Direct fetch returned empty array, falling back to overview extraction",
        );
      }
    } catch (fetchError: any) {
      // Fallback: extract the last message from the chat overview silently
      console.log(
        `[WA/Messages] Direct fetch failed (${fetchError.message}), attempting fallback extraction...`,
      );
      try {
        const chats = await getWahaChats();
        const chat = chats.find((c: any) => {
          const id = c.id?._serialized || c.id || "";
          return id === chatId;
        });

        if (chat?.lastMessage) {
          const data = chat.lastMessage._data || chat.lastMessage;
          const isFromMe = data.id?.fromMe ?? data.key?.fromMe ?? data.fromMe ?? false;
          const ts = data.t || data.messageTimestamp || chat.lastMessage.timestamp || chat.timestamp;
          const hasMedia =
            (data.type &&
              data.type !== "chat" &&
              data.type !== "notification_template") ||
            (chat.lastMessage.type &&
              chat.lastMessage.type !== "chat" &&
              chat.lastMessage.type !== "notification_template");

          wahaMessages = [
            {
              id: data.id?._serialized || data.key?.id || data.id || `fallback_${Date.now()}`,
              timestamp: ts,
              from: isFromMe ? "me" : chatId,
              fromMe: isFromMe,
              body:
                data.body ||
                data.message?.conversation ||
                data.message?.extendedTextMessage?.text ||
                chat.lastMessage.body ||
                (hasMedia ? "[Media]" : ""),
              hasMedia: !!hasMedia,
              _data: data // keep _data payload for custom extracting
            },
          ];
          console.log(
            `[WA/Messages] Fallback extracted 1 message from chat overview`,
          );
        } else {
          console.log(
            `[WA/Messages] Fallback found no lastMessage for chatId=${chatId}`,
          );
        }
      } catch (fallbackError: any) {
        console.warn(
          `[WA/Messages] ⚠️ Fallback extraction also failed for ${chatId}:`,
          fallbackError.message,
        );
      }
    }

    // Transform WAHA messages to match the frontend's expected format natively seamlessly
    const messages = wahaMessages.map((msg: any) => {
      const data = msg._data || msg;
      
      let msgId = typeof msg.id === "string" 
        ? msg.id 
        : (msg.id?._serialized || data.id?._serialized || data.key?.id || (msg.id ? JSON.stringify(msg.id) : `msg_${Date.now()}_${Math.random()}`));

      const isFromMe = msg.id?.fromMe ?? data.key?.fromMe ?? data.id?.fromMe ?? msg.fromMe ?? data.fromMe ?? false;
      const ts = msg.timestamp || data.messageTimestamp || data.timestamp || data.t || Math.floor(Date.now() / 1000);

      const content = msg.body || data.message?.conversation || data.message?.extendedTextMessage?.text || data.body || (msg.hasMedia || data.hasMedia ? "[Media]" : "");

      // Use the full WAHA file URL directly (e.g. http://localhost:3000/api/files/default/XYZ.jpeg).
      // Our proxy at /api/wa/media/[id] will add the X-Api-Key and stream it back.
      // Fallback to the message ID if media.url is not present but hasMedia is true.
      const wahaMediaUrl: string | null =
        msg.media?.url ||
        ((msg.hasMedia || data.hasMedia)
          ? `waha_fallback:${msgId}`
          : null);

      return {
        id: msgId,
        phone,
        role: isFromMe ? "assistant" : "user",
        content,
        created_at: new Date(ts * 1000).toISOString(),
        image_url: wahaMediaUrl,
      };
    });

    // Sort by timestamp ascending (oldest first) for chat display
    messages.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    const duration = (performance.now() - startTime).toFixed(1);
    console.log(
      `[WA/Messages] ✅ Returning ${messages.length} messages for chatId=${chatIdParam || phone} in ${duration}ms`,
    );

    return NextResponse.json({ data: messages });
  } catch (error: any) {
    const duration = (performance.now() - startTime).toFixed(1);
    console.error(
      `[WA/Messages] ❌ Failed after ${duration}ms:`,
      error.message || error,
    );
    return NextResponse.json(
      { message: error.message || "Failed to fetch WA messages" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/wa/messages
 * Send a text message via WAHA.
 * Body: { phone: string, content: string }
 */
export async function POST(request: Request) {
  const startTime = performance.now();
  console.log(`[WA/SendMsg] POST request received`);

  if (!isWaConfigured()) {
    console.warn(`[WA/SendMsg] WAHA not configured — returning 503`);
    return NextResponse.json(
      { message: "WAHA is not configured" },
      { status: 503 },
    );
  }

  try {
    const { phone, chatId: rawChatId, content } = await request.json();

    // Use chatId (with @lid/@c.us suffix) if provided, otherwise fall back to phone
    const targetId = rawChatId || phone;
    console.log(
      `[WA/SendMsg] targetId=${targetId}, contentLength=${content?.length || 0}`,
    );

    if (!targetId || !content) {
      console.warn(`[WA/SendMsg] Bad request — missing targetId or content`);
      return NextResponse.json(
        { message: "Phone/chatId and content are required" },
        { status: 400 },
      );
    }

    // Send message via WAHA instantly in the background without awaiting it.
    // This allows the UI to unlock immediately and appear instantaneous organically.
    sendWaTextMessage(targetId, content).catch((e) => {
      console.error(
        `[WA/SendMsg] ❌ Background WAHA send failed for ${targetId}:`,
        e.message,
      );
    });

    const duration = (performance.now() - startTime).toFixed(1);
    console.log(
      `[WA/SendMsg] ✅ Message queued for ${targetId} in ${duration}ms (fire-and-forget)`,
    );

    return NextResponse.json(
      {
        data: {
          id: `fast-${Date.now()}`,
          phone,
          role: "assistant",
          content,
          created_at: new Date().toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error: any) {
    const duration = (performance.now() - startTime).toFixed(1);
    console.error(
      `[WA/SendMsg] ❌ Failed after ${duration}ms:`,
      error.message || error,
    );
    return NextResponse.json(
      { message: error.message || "Failed to send WA message" },
      { status: 500 },
    );
  }
}
