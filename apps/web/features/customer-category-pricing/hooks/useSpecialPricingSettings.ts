"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const QUERY_KEY = ["settings", "special-pricing"] as const;
const STORAGE_KEY = "pos-special-pricing-enabled";

function savedEnabled(): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "true" ? true : saved === "false" ? false : undefined;
  } catch { return undefined; }
}

function saveEnabled(enabled: boolean) {
  try { window.localStorage.setItem(STORAGE_KEY, String(enabled)); } catch { /* Continue with query data. */ }
}

export function useSpecialPricingSettings() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch("/api/settings/special-pricing", { cache: "no-store" });
      if (!response.ok) throw new Error("Pengaturan Harga Khusus belum dapat dimuat.");
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || typeof (body as { enabled?: unknown }).enabled !== "boolean") throw new Error("Pengaturan Harga Khusus tidak valid.");
      const enabled = (body as { enabled: boolean }).enabled;
      saveEnabled(enabled);
      return enabled;
    },
    initialData: savedEnabled,
    initialDataUpdatedAt: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });
}

export function useUpdateSpecialPricingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await fetch("/api/settings/special-pricing", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.enabled !== "boolean") throw new Error(body.message || "Pengaturan Harga Khusus belum dapat disimpan.");
      return body.enabled as boolean;
    },
    onSuccess: (enabled) => {
      saveEnabled(enabled);
      queryClient.setQueryData(QUERY_KEY, enabled);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["customer-category-pricing-rules"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
