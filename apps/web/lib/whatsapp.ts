/**
 * WhatsApp API — interact with WAHA (WhatsApp HTTP API) self-hosted server.
 *
 * Endpoints used:
 * - GET  /api/{session}/chats/overview      → list all chats with last message
 * - GET  /api/{session}/chats/{chatId}/messages → get messages for a specific chat
 * - POST /api/sendText                       → send a text message
 */

// ── Credentials ─────────────────────────────────────────────────

export function getWahaConfig() {
  const baseUrl = process.env.WAHA_BASE_URL;
  const apiKey = process.env.WAHA_API_KEY;
  const session = process.env.WAHA_SESSION || "default";

  if (!baseUrl) {
    throw new Error("Missing WAHA_BASE_URL environment variable");
  }

  return { baseUrl, apiKey, session };
}

export function isWaConfigured(): boolean {
  return !!process.env.WAHA_BASE_URL;
}

function getHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (apiKey) {
    headers["X-Api-Key"] = apiKey;
  }
  return headers;
}

// ── Types ───────────────────────────────────────────────────────

export interface WahaChat {
  /** Chat ID, e.g. "6281234567890@c.us" or "120363...@g.us" */
  id: string;
  /** Display name of the contact/group */
  name: string | null;
  /** Profile picture URL */
  picture: string | null;
  /** Last message preview */
  lastMessage: {
    id: string;
    timestamp: number;
    from: string;
    fromMe: boolean;
    body: string;
    hasMedia: boolean;
  } | null;
}

export interface WahaMessage {
  id: string;
  timestamp: number;
  from: string;
  fromMe: boolean;
  body: string;
  hasMedia: boolean;
  /** Media URL if `downloadMedia=true` was used */
  media?: {
    url: string;
    mimetype: string;
    filename: string;
  } | null;
}

// ── Get all chats (overview) ────────────────────────────────────

export async function getWahaChats(): Promise<any[]> {
  const { baseUrl, apiKey, session } = getWahaConfig();
  // Using merge=true to include contact name and chat details together as shown in the user's curl example
  const url = `${baseUrl}/api/${session}/chats?merge=true`;

  const res = await fetch(url, {
    headers: getHeaders(apiKey),
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[WAHA] Failed to fetch chats — ${res.status}: ${errorText}`);
    throw new Error(`Failed to fetch chats from WAHA: ${res.statusText}`);
  }

  return res.json();
}

// ── Get messages for a specific chat ────────────────────────────

export async function getWahaChatMessages(
  chatId: string,
  limit = 100,
  downloadMedia = false,
): Promise<WahaMessage[]> {
  const { baseUrl, apiKey, session } = getWahaConfig();
  const url = `${baseUrl}/api/${session}/chats/${encodeURIComponent(chatId)}/messages?sortBy=timestamp&downloadMedia=${downloadMedia}&merge=true&limit=${limit}`;

  const res = await fetch(url, {
    headers: getHeaders(apiKey),
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(
      `[WAHA] Failed to fetch messages for ${chatId} — ${res.status}: ${errorText}`,
    );
    throw new Error(`Failed to fetch messages from WAHA: ${res.statusText}`);
  }

  return res.json();
}

// ── Send text message ────────────────────────────────────────────

export async function sendWaTextMessage(
  to: string,
  body: string,
): Promise<void> {
  const { baseUrl, apiKey, session } = getWahaConfig();
  const url = `${baseUrl}/api/sendText`;

  // Ensure proper chatId format
  const chatId = to.includes("@") ? to : `${to}@c.us`;

  const payload = {
    session,
    chatId,
    text: body,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(
      `[WAHA] Failed to send message to ${to} — ${res.status}: ${errorText}`,
    );
    throw new Error(`Failed to send WhatsApp message: ${res.statusText}`);
  }

  console.log(`[WAHA] Message sent to ${to}`);
}
