import { NextResponse } from "next/server";
import { getWahaChats, isWaConfigured } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * GET /api/wa/contacts
 * Returns a list of all WhatsApp chats from WAHA, ordered by most recent.
 * Each entry includes the chat name, picture, and last message preview.
 */
export async function GET() {
  if (!isWaConfigured()) {
    return NextResponse.json(
      { message: "WAHA is not configured. Set WAHA_BASE_URL in your .env" },
      { status: 503 }
    );
  }

  try {
    const chats = await getWahaChats();

    // Transform WAHA response to match the frontend's expected format
    const contacts = chats
      .filter((chat: any) => {
        const idString = chat.id?._serialized || chat.id || "";
        // Allow @c.us and @lid (WhatsApp Linked Devices/Business contacts)
        return (idString.endsWith("@c.us") || idString.endsWith("@lid") || idString.endsWith("@s.whatsapp.net")) && idString !== "0@c.us";
      })
      .map((chat: any) => {
        const idString = chat.id?._serialized || chat.id;
        // Strip out the server suffix suffix to get just the phone/user id
        const phoneStr = idString.split("@")[0];
        
        let role = "user";
        let content = "";
        let timestamp = chat.timestamp;
        let hasMedia = false;

        if (chat.lastMessage) {
            // Using the _data object as seen in /api/{session}/chats payload, or fallback
            const data = chat.lastMessage._data || chat.lastMessage;
            if (data) {
                // For nested structure, we might need to check multiple places depending on WAHA version
                const isFromMe = data.id?.fromMe ?? data.fromMe ?? false;
                role = isFromMe ? "assistant" : "user";
                content = data.body || chat.lastMessage.body || "";
                
                // Identify media based on type
                hasMedia = (data.type && data.type !== "chat" && data.type !== "notification_template") || 
                           (chat.lastMessage.type && chat.lastMessage.type !== "chat" && chat.lastMessage.type !== "notification_template");
                
                // If the payload provides its own timestamp, use it
                if (data.t) timestamp = data.t;
                else if (chat.lastMessage.timestamp) timestamp = chat.lastMessage.timestamp;
            }
        }

        return {
          id: idString,
          phone: phoneStr,
          name: chat.name || phoneStr,
          picture: chat.picture || null,
          role,
          content,
          created_at: timestamp
            ? new Date(timestamp * 1000).toISOString()
            : new Date().toISOString(),
          image_url: hasMedia ? "media" : null,
        };
      });

    return NextResponse.json({ data: contacts });
  } catch (error: any) {
    console.error("Failed to fetch WA contacts from WAHA:", error);
    return NextResponse.json(
      { message: error.message || "Failed to fetch WA contacts" },
      { status: 500 }
    );
  }
}
