"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StoreSettings {
  id: string;
  name: string;
  address: string;
  phone: string;
  logoUrl: string | null;
  updatedAt?: string;
}

export type WaStatus = "CONNECTED" | "SCAN_QR_CODE" | "DISCONNECTED" | "UNKNOWN" | "NOT_CONFIGURED";

export interface WaStatusResponse {
  status: WaStatus;
  message?: string;
  raw?: Record<string, unknown>;
}

export interface WaQrResponse {
  value?: string; // base64 QR data from WAHA
  [key: string]: unknown;
}

// ── Store Settings ─────────────────────────────────────────────────────────────

export function useStoreSettings() {
  return useQuery<StoreSettings>({
    queryKey: ["settings", "store"],
    queryFn: async () => {
      const res = await fetch("/api/settings/store");
      if (!res.ok) throw new Error("Failed to fetch store settings");
      return res.json();
    },
  });
}

export function useUpdateStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<Omit<StoreSettings, "id" | "updatedAt">>) => {
      const res = await fetch("/api/settings/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to save settings");
      }
      return res.json() as Promise<StoreSettings>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["settings", "store"], data);
    },
  });
}

// ── WhatsApp ───────────────────────────────────────────────────────────────────

export function useWaStatus() {
  return useQuery<WaStatusResponse>({
    queryKey: ["settings", "wa-status"],
    queryFn: async () => {
      const res = await fetch("/api/settings/whatsapp/status");
      // 503 = not configured — handle gracefully
      if (res.status === 503) return { status: "NOT_CONFIGURED" as WaStatus };
      if (!res.ok) return { status: "UNKNOWN" as WaStatus };
      return res.json();
    },
    refetchInterval: 3_000,
    retry: false,
  });
}

export function useWaQr() {
  return useQuery<WaQrResponse>({
    queryKey: ["settings", "wa-qr"],
    queryFn: async () => {
      const res = await fetch("/api/settings/whatsapp/qr");
      if (!res.ok) throw new Error("Failed to fetch QR code");
      return res.json();
    },
    enabled: false, // manual trigger only
    retry: false,
  });
}
