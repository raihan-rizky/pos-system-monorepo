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
  if (!isWaConfigured()) {
    return NextResponse.json(
      { message: "WAHA is not configured" },
      { status: 503 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get("phone");
    const chatIdParam = searchParams.get("chatId");

    const targetId = chatIdParam || phone;

    if (!targetId || targetId === "0") {
      return NextResponse.json(
        { message: "Valid Phone or ChatId parameter is required" },
        { status: 400 },
      );
    }

    let chatId = targetId;

    // If frontend sends an old format (no suffix), auto-discover it from the contacts list
    if (!chatId.includes("@")) {
      try {
        const chats = await getWahaChats();
        const match = chats.find((c: any) => {
          const id = c.id?._serialized || c.id || "";
          return id.split("@")[0] === chatId;
        });
        if (match) {
          chatId = match.id?._serialized || match.id;
        } else {
          chatId = `${chatId}@c.us`; // Fallback
        }
      } catch (e) {
        chatId = `${chatId}@c.us`; // Fallback if WAHA chats API fails
      }
    }

    let wahaMessages: any[] = [];
    try {
      wahaMessages = await getWahaChatMessages(chatId, 10, false);
    } catch (fetchError: any) {
      console.warn(
        `[WAHA] Could not fetch messages for ${chatId}, falling back to chat overview.`,
        fetchError.message,
      );

      // Fallback: extract the last message from the chat overview
      try {
        const chats = await getWahaChats();
        const chat = chats.find((c: any) => {
          const id = c.id?._serialized || c.id || "";
          return id === chatId;
        });

        if (chat?.lastMessage) {
          const data = chat.lastMessage._data || chat.lastMessage;
          const isFromMe = data.id?.fromMe ?? data.fromMe ?? false;
          const ts = data.t || chat.lastMessage.timestamp || chat.timestamp;
          const hasMedia =
            (data.type &&
              data.type !== "chat" &&
              data.type !== "notification_template") ||
            (chat.lastMessage.type &&
              chat.lastMessage.type !== "chat" &&
              chat.lastMessage.type !== "notification_template");

          wahaMessages = [
            {
              id: data.id?._serialized || data.id || `fallback_${Date.now()}`,
              timestamp: ts,
              from: isFromMe ? "me" : chatId,
              fromMe: isFromMe,
              body:
                data.body ||
                chat.lastMessage.body ||
                (hasMedia ? "[Media]" : ""),
              hasMedia: !!hasMedia,
            },
          ];
          console.log(
            `[WAHA] Recovered last message for ${chatId} from chat overview.`,
          );
        }
      } catch (fallbackError: any) {
        console.warn(
          `[WAHA] Fallback also failed for ${chatId}, treating as empty chat.`,
          fallbackError.message,
        );
      }
    }

    // Transform WAHA messages to match the frontend's expected format
    const messages = wahaMessages.map((msg: any) => ({
      id: msg.id,
      phone,
      role: msg.fromMe ? "assistant" : "user",
      content: msg.body || (msg.hasMedia ? "[Media]" : ""),
      created_at: new Date(msg.timestamp * 1000).toISOString(),
      image_url:
        msg.media?.url || (msg.hasMedia ? `waha_media:${msg.id}` : null),
    }));

    // Sort by timestamp ascending (oldest first) for chat display
    messages.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    return NextResponse.json({ data: messages });
  } catch (error: any) {
    console.error("Failed to fetch WA messages from WAHA:", error);
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
  if (!isWaConfigured()) {
    return NextResponse.json(
      { message: "WAHA is not configured" },
      { status: 503 },
    );
  }

  try {
    const { phone, chatId: rawChatId, content } = await request.json();

    // Use chatId (with @lid/@c.us suffix) if provided, otherwise fall back to phone
    const targetId = rawChatId || phone;

    if (!targetId || !content) {
      return NextResponse.json(
        { message: "Phone/chatId and content are required" },
        { status: 400 },
      );
    }

    // Send message via WAHA
    await sendWaTextMessage(targetId, content);

    return NextResponse.json(
      {
        data: {
          phone,
          role: "assistant",
          content,
          created_at: new Date().toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Failed to send WA message via WAHA:", error);
    return NextResponse.json(
      { message: error.message || "Failed to send WA message" },
      { status: 500 },
    );
  }
}
