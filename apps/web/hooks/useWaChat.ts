"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
  return useQuery({
    queryKey: ["wa-contacts"],
    queryFn: async (): Promise<WaContact[]> => {
      const res = await fetch("/api/wa/contacts");
      if (!res.ok) throw new Error("Failed to fetch WA contacts");
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 5000, // Poll every 5s for new messages/contacts
  });
}

export function useWaMessages(chatId: string | null) {
  const queryClient = useQueryClient();

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
        merged.set(msg.id, msg);
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
    refetchInterval: 3000, // Poll every 3s when chat is open for real-time feel
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
    onSuccess: (_data, vars) => {
      // Immediately refetch to show the sent message
      queryClient.invalidateQueries({
        queryKey: ["wa-messages", vars.chatId],
      });
      queryClient.invalidateQueries({ queryKey: ["wa-contacts"] });
    },
  });
}
