"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_PRICE_ROUNDING_SETTINGS, validatePriceRoundingSettings, type PriceRoundingSettings } from "../rounding";

const QUERY_KEY = ["settings", "price-rounding"] as const;
const STORAGE_KEY = "pos-price-rounding-settings";

function readSavedPolicy(): PriceRoundingSettings | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? validatePriceRoundingSettings(JSON.parse(saved)) : undefined;
  } catch {
    return undefined;
  }
}

function savePolicy(settings: PriceRoundingSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // The active policy remains available in query data if storage is unavailable.
  }
}

export function usePriceRoundingSettings() {
  return useQuery<PriceRoundingSettings>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch("/api/settings/price-rounding", { cache: "no-store" });
      if (!response.ok) throw new Error("Gagal memuat pengaturan pembulatan harga.");
      const settings = validatePriceRoundingSettings(await response.json());
      savePolicy(settings);
      return settings;
    },
    initialData: readSavedPolicy,
    initialDataUpdatedAt: 0,
    placeholderData: DEFAULT_PRICE_ROUNDING_SETTINGS,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });
}

export function useUpdatePriceRoundingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: PriceRoundingSettings) => {
      const validated = validatePriceRoundingSettings(settings);
      const response = await fetch("/api/settings/price-rounding", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validated),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Gagal menyimpan pengaturan pembulatan harga.");
      return validatePriceRoundingSettings(body);
    },
    onSuccess: (settings) => {
      savePolicy(settings);
      queryClient.setQueryData(QUERY_KEY, settings);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-category-pricing-rules"] });
    },
  });
}
