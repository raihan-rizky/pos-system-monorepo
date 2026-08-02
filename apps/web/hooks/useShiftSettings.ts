"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ShiftSettings {
  enabled: boolean;
}

const SHIFT_SETTINGS_QUERY_KEY = ["settings", "shift"] as const;

export function useShiftSettings(initialEnabled?: boolean) {
  return useQuery<ShiftSettings>({
    queryKey: SHIFT_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const response = await fetch("/api/settings/shift");
      if (!response.ok) throw new Error("Gagal memuat pengaturan shift.");
      return response.json() as Promise<ShiftSettings>;
    },
    initialData:
      initialEnabled === undefined ? undefined : { enabled: initialEnabled },
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });
}

export function useUpdateShiftSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ShiftSettings) => {
      const response = await fetch("/api/settings/shift", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message || "Gagal menyimpan pengaturan shift.");
      }
      return body as ShiftSettings;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(SHIFT_SETTINGS_QUERY_KEY, data);
      queryClient.invalidateQueries({ queryKey: SHIFT_SETTINGS_QUERY_KEY });
    },
  });
}
