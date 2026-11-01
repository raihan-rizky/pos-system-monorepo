"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  DatabaseResetSelection,
  DatabaseResetPreview,
  DatabaseResetSummary,
} from "@/features/database-reset/types/database-reset";

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return new Error(typeof body.message === "string" ? body.message : fallback);
}

export function useDatabaseResetPreview() {
  return useMutation<DatabaseResetPreview, Error, DatabaseResetSelection>({
    mutationFn: async (selection) => {
      const response = await fetch("/api/settings/database-reset/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection),
      });
      if (!response.ok) throw await readError(response, "Gagal menyiapkan preview reset.");
      return response.json() as Promise<DatabaseResetPreview>;
    },
  });
}

export function useDatabaseResetExecute() {
  const queryClient = useQueryClient();
  return useMutation<DatabaseResetSummary, Error, DatabaseResetSelection & { confirmation: string }>({
    mutationFn: async (payload) => {
      const response = await fetch("/api/settings/database-reset/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw await readError(response, "Reset database gagal.");
      return response.json() as Promise<DatabaseResetSummary>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });
}
