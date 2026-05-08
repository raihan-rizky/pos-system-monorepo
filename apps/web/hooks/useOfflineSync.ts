"use client";

import { useCallback, useEffect, useState } from "react";

export type OfflineSyncSummary = {
  pending: number;
  syncing: number;
  failed: number;
  pendingApproval: number;
  lastSyncAt: string | null;
};

const EMPTY_SUMMARY: OfflineSyncSummary = {
  pending: 0,
  syncing: 0,
  failed: 0,
  pendingApproval: 0,
  lastSyncAt: null,
};

export function useOfflineSync() {
  const [summary, setSummary] = useState<OfflineSyncSummary>(EMPTY_SUMMARY);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const { getOfflineQueueSummary } = await import("@/lib/offline/offline-db");
    setSummary(await getOfflineQueueSummary());
  }, []);

  const syncNow = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.onLine) {
      setError("Tidak bisa sync saat offline.");
      return null;
    }

    setIsSyncing(true);
    setError(null);
    try {
      const { syncOfflineTransactions } = await import(
        "@/lib/offline/offline-sync-client"
      );
      const result = await syncOfflineTransactions();
      await refresh();
      return result;
    } catch (syncError) {
      const message =
        syncError instanceof Error ? syncError.message : "Gagal melakukan sync.";
      setError(message);
      await refresh();
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [refresh]);

  const clearSynced = useCallback(async () => {
    const { clearSyncedOfflineTransactions } = await import(
      "@/lib/offline/offline-db"
    );
    await clearSyncedOfflineTransactions();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
    const onQueueChange = () => refresh();
    const onOnline = () => {
      setIsOnline(true);
      void syncNow();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener("pos-offline-queue-changed", onQueueChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("pos-offline-queue-changed", onQueueChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh, syncNow]);

  return {
    summary,
    isOnline,
    isSyncing,
    error,
    refresh,
    syncNow,
    clearSynced,
  };
}
