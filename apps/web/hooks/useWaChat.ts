"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface WaContact {
  id: string;
  phone: string;
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

export function useWaMessages(phone: string | null) {
  return useQuery({
    queryKey: ["wa-messages", phone],
    queryFn: async (): Promise<WaMessage[]> => {
      if (!phone) return [];
      const res = await fetch(`/api/wa/messages?phone=${phone}`);
      if (!res.ok) throw new Error("Failed to fetch WA messages");
      const json = await res.json();
      return json.data;
    },
    enabled: !!phone,
    refetchInterval: 3000, // Poll every 3s when chat is open for real-time feel
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { phone: string; content: string }) => {
      const res = await fetch("/api/wa/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to send WA message");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate the specific chat and the contacts list to reflect new message immediately
      queryClient.invalidateQueries({ queryKey: ["wa-messages", variables.phone] });
      queryClient.invalidateQueries({ queryKey: ["wa-contacts"] });
    },
  });
}
