"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

export interface WaContact {
  id: string;
  phone: string;
  name: string | null;
  picture: string | null;
  role: string;
  content: string;
  created_at: string;
  image_url: string | null;
}

export interface WaMessage {
  id: string;
  phone: string;
  chat_id?: string;
  role: string;
  content: string;
  created_at: string;
  image_url: string | null;
}

type WahaId =
  | string
  | {
      _serialized?: string;
      fromMe?: boolean;
      remote?: string;
      id?: string;
    };

type WahaRealtimePayload = {
  id?: WahaId;
  key?: { id?: string; fromMe?: boolean; remoteJid?: string };
  from?: string | { _serialized?: string };
  to?: string | { _serialized?: string };
  fromMe?: boolean;
  body?: string;
  type?: string;
  timestamp?: number;
  t?: number;
  messageTimestamp?: number;
  hasMedia?: boolean;
  media?: { url?: string } | null;
  pushName?: string | null;
  _data?: Partial<WahaRealtimePayload>;
};

type SupabaseBroadcast<T> = { payload: T };

function extractWaId(
  value: WahaId | string | { _serialized?: string } | undefined | null,
) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._serialized || "";
}

function normalizeChatId(chatId: string) {
  return chatId.endsWith("@s.whatsapp.net")
    ? chatId.replace("@s.whatsapp.net", "@c.us")
    : chatId;
}

function getRealtimeMessage(payload: WahaRealtimePayload): WaMessage | null {
  const data = payload._data || payload;
  const id = payload.id || data.id;
  const fromMe =
    (typeof id === "object" ? id?.fromMe : undefined) ??
    payload.key?.fromMe ??
    data.key?.fromMe ??
    payload.fromMe ??
    data.fromMe ??
    false;

  const remoteFromId = typeof id === "object" ? id.remote : undefined;
  const remoteFromKey = payload.key?.remoteJid || data.key?.remoteJid;
  const rawChatId =
    remoteFromId ||
    remoteFromKey ||
    (fromMe
      ? extractWaId(payload.to || data.to)
      : extractWaId(payload.from || data.from));

  const chatId = normalizeChatId(rawChatId);
  if (!chatId) return null;

  const rawTimestamp =
    payload.timestamp ||
    data.timestamp ||
    payload.t ||
    data.t ||
    payload.messageTimestamp ||
    data.messageTimestamp;
  const timestampMs = rawTimestamp
    ? rawTimestamp < 1e11
      ? rawTimestamp * 1000
      : rawTimestamp
    : Date.now();

  const messageId =
    extractWaId(id) ||
    payload.key?.id ||
    data.key?.id ||
    `realtime-${chatId}-${timestampMs}`;
  const hasMedia =
    payload.hasMedia ||
    data.hasMedia ||
    (data.type && data.type !== "chat" && data.type !== "notification_template");
  const content = payload.body || data.body || (hasMedia ? "[Media]" : "");
  const imageUrl =
    payload.media?.url ||
    data.media?.url ||
    (hasMedia ? `waha_fallback:${messageId}` : null);

  return {
    id: messageId,
    phone: chatId.split("@")[0],
    chat_id: chatId,
    role: fromMe ? "assistant" : "user",
    content,
    created_at: new Date(timestampMs).toISOString(),
    image_url: imageUrl,
  };
}

function upsertMessage(messages: WaMessage[] | undefined, incoming: WaMessage) {
  const byId = new Map<string, WaMessage>();
  for (const message of messages || []) {
    byId.set(message.id, message);
  }
  byId.set(incoming.id, incoming);

  return Array.from(byId.values());
}

function upsertContact(
  contacts: WaContact[] | undefined,
  incoming: WaMessage,
  name?: string | null,
) {
  const chatId = incoming.chat_id || `${incoming.phone}@c.us`;
  const existing = (contacts || []).find((contact) => contact.id === chatId);
  const nextContact: WaContact = {
    id: existing?.id || chatId,
    phone: incoming.phone,
    name: existing?.name || name || incoming.phone,
    picture: existing?.picture || null,
    role: incoming.role,
    content: incoming.image_url ? "[Media]" : incoming.content,
    created_at: incoming.created_at,
    image_url: incoming.image_url,
  };

  return [
    nextContact,
    ...(contacts || []).filter((contact) => contact.id !== nextContact.id),
  ].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function useWaContacts() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E === "1") return;

    const supabase = createClient();
    const channel = supabase
      .channel("waha-webhook")
      .on(
        "broadcast",
        { event: "new-message" },
        (event: SupabaseBroadcast<WahaRealtimePayload>) => {
          const message = getRealtimeMessage(event.payload);
          if (message) {
            queryClient.setQueryData<WaContact[]>(["wa-contacts"], (old) =>
              upsertContact(
                old,
                message,
                event.payload.pushName || event.payload._data?.pushName,
              ),
            );
          }
          void queryClient.invalidateQueries({ queryKey: ["wa-contacts"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["wa-contacts"],
    queryFn: async (): Promise<WaContact[]> => {
      const res = await fetch("/api/wa/contacts");
      if (!res.ok) throw new Error("Failed to fetch WA contacts");
      const json = await res.json();
      return json.data;
    },
    staleTime: 1000,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useWaMessages(chatId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!chatId || chatId === "0") return;
    if (process.env.NEXT_PUBLIC_E2E === "1") return;

    const supabase = createClient();
    const channel = supabase
      .channel("waha-webhook")
      .on(
        "broadcast",
        { event: "new-message" },
        (event: SupabaseBroadcast<WahaRealtimePayload>) => {
          const message = getRealtimeMessage(event.payload);
          if (!message) return;

          const incomingChatId = message.chat_id || `${message.phone}@c.us`;

          if (incomingChatId === chatId) {
            queryClient.setQueryData<WaMessage[]>(
              ["wa-messages", chatId],
              (old) => upsertMessage(old, message),
            );
          }
          queryClient.setQueryData<WaContact[]>(["wa-contacts"], (old) =>
            upsertContact(
              old,
              message,
              event.payload.pushName || event.payload._data?.pushName,
            ),
          );
          void queryClient.invalidateQueries({
            queryKey: ["wa-messages", chatId],
          });
          void queryClient.invalidateQueries({ queryKey: ["wa-contacts"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, queryClient]);

  return useQuery({
    queryKey: ["wa-messages", chatId],
    queryFn: async (): Promise<WaMessage[]> => {
      if (!chatId || chatId === "0") return [];
      const res = await fetch(
        `/api/wa/messages?chatId=${encodeURIComponent(chatId)}`,
      );
      if (!res.ok) throw new Error("Failed to fetch WA messages");
      const json = await res.json();
      const freshMessages: WaMessage[] = json.data;

      // Merge with existing cached messages so fallback responses
      // (which may only contain 1 message) don't erase history
      const cached: WaMessage[] =
        queryClient.getQueryData(["wa-messages", chatId]) || [];

      // Use a map to deduplicate by ID
      const merged = new Map<string, WaMessage>();
      for (const msg of cached) {
        const msgIdStr = String(msg.id);
        if (msgIdStr.startsWith("optimistic-") || msgIdStr.startsWith("fast-")) {
          // Keep optimistic messages for up to 15 seconds to prevent flickering
          // while waiting for WAHA to truly sync the sent message
          const msgAge = Date.now() - new Date(msg.created_at).getTime();
          if (msgAge < 15000) {
            // Check if backend already sent the true message (same content, assistant role, close timestamp)
            const isDuplicated = freshMessages.some(fm => fm.content === msg.content && fm.role === msg.role && Math.abs(new Date(fm.created_at).getTime() - new Date(msg.created_at).getTime()) < 30000);
            if (!isDuplicated) {
              merged.set(msgIdStr, msg);
            }
          }
        } else {
          merged.set(msgIdStr, msg);
        }
      }
      for (const msg of freshMessages) {
        merged.set(msg.id, msg);
      }

      return Array.from(merged.values());
    },
    enabled: !!chatId,
    staleTime: 1000,
    refetchInterval: chatId ? 2500 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { chatId: string; content: string }) => {
      const res = await fetch("/api/wa/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...vars,
          phone: vars.chatId.split("@")[0],
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to send WA message");
      }
      return res.json();
    },
    onSuccess: (response, vars) => {
      // The backend now resolves instantly. We append the server-acknowledged message to the cache natively
      const serverMsg = response.data;
      queryClient.setQueryData<WaMessage[]>(["wa-messages", vars.chatId], (old) => {
        return [...(old || []), serverMsg];
      });
    },
    onSettled: (_data, _error, vars) => {
      // We no longer blindly invalidate here because the server responded instantly and 
      // the background WAHA task might take 2 seconds. The 3-second background polling
      // will naturally catch the true message organically without duplicates.
      queryClient.invalidateQueries({ queryKey: ["wa-contacts"] });
    },
  });
}

export function useAutoReplyStatus() {
  return useQuery({
    queryKey: ["wa-auto-reply"],
    queryFn: async (): Promise<boolean> => {
      const res = await fetch("/api/wa/auto-reply");
      if (!res.ok) throw new Error("Failed to fetch auto-reply status");
      const json = await res.json();
      return json.isAutoReplyOn;
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
}

export function useToggleAutoReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enable: boolean) => {
      const res = await fetch("/api/wa/auto-reply", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable }),
      });
      if (!res.ok) {
        throw new Error("Failed to update auto-reply status");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["wa-auto-reply"], data.isAutoReplyOn);
    },
  });
}
