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
  role: string;
  content: string;
  created_at: string;
  image_url: string | null;
}

export function useWaContacts() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel('waha-webhook-contacts')
      .on('broadcast', { event: 'new-message' }, () => {
         queryClient.invalidateQueries({ queryKey: ["wa-contacts"] });
      })
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
    refetchInterval: 60000, // Reduced from 5s to 60s fallback, relying on Webhooks for real-time
    refetchIntervalInBackground: false, // Stop polling when tab/page is not focused
  });
}

export function useWaMessages(chatId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!chatId || chatId === "0") return;

    const supabase = createClient();
    const channel = supabase.channel('waha-webhook')
      .on('broadcast', { event: 'new-message' }, (payload) => {
         // Invalidate queries to trigger a refetch when a new message arrives via webhook
         queryClient.invalidateQueries({ queryKey: ["wa-messages", chatId] });
         queryClient.invalidateQueries({ queryKey: ["wa-contacts"] });
      })
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

      // Sort by timestamp ascending (oldest first)
      return Array.from(merged.values()).sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    },
    enabled: !!chatId,
    refetchInterval: 60000, // Changed from 3s to 60s fallback, relying on Webhooks for real-time
    refetchIntervalInBackground: false, // Stop polling when tab/page is not focused
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

