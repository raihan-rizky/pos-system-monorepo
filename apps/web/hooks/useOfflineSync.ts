"use client";

import { useCallback, useEffect, useState } from "react";
import { useRole } from "@/components/providers/RoleProvider";
import type { OfflineShiftRecord, OfflineTransactionRecord } from "@/lib/offline/offline-db";

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
  const { userId, storeId, isOfflineSession, isSessionRecovering } = useRole();
  const [summary, setSummary] = useState<OfflineSyncSummary>(EMPTY_SUMMARY);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<OfflineTransactionRecord[]>([]);
  const [shifts, setShifts] = useState<OfflineShiftRecord[]>([]);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const { getOfflineQueueSummary, getOfflineQueueRecords, offlineDb } = await import("@/lib/offline/offline-db");
    const [nextSummary, nextRecords, nextShifts] = await Promise.all([
      getOfflineQueueSummary(userId ? { cashierId: userId, storeId: storeId || "store-main" } : null),
      getOfflineQueueRecords(), offlineDb.offlineShifts.orderBy("openedAt").reverse().toArray(),
    ]);
    setSummary(nextSummary);
    setRecords(nextRecords);
    setShifts(nextShifts);
  }, [userId, storeId]);

  const syncNow = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.onLine) {
      setError("Tidak bisa sync saat offline.");
      return null;
    }
    if (!userId) {
      setError("Identitas kasir belum tersedia. Masuk kembali untuk sinkronisasi.");
      return null;
    }
    if (isOfflineSession || isSessionRecovering) return null;

    setIsSyncing(true);
    setError(null);
    try {
      const { syncOfflineWork } = await import(
        "@/lib/offline/offline-work-sync"
      );
      const result = await syncOfflineWork({ cashierId: userId, storeId: storeId || "store-main" });
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
  }, [refresh, userId, storeId, isOfflineSession, isSessionRecovering]);

  const clearSynced = useCallback(async () => {
    if (!userId || isSessionRecovering) return;
    const { clearSyncedOfflineTransactions } = await import(
      "@/lib/offline/offline-db"
    );
    await clearSyncedOfflineTransactions(storeId || "store-main");
    await refresh();
  }, [refresh, storeId, userId, isSessionRecovering]);

  const retryRecord = useCallback(async (clientMutationId: string) => {
    if (isSessionRecovering) return;
    if (!userId) {
      setError("Identitas kasir belum tersedia. Masuk kembali untuk mencoba lagi.");
      return;
    }
    try {
      const { retryOfflineTransaction } = await import("@/lib/offline/offline-db");
      await retryOfflineTransaction(clientMutationId, { cashierId: userId, storeId: storeId || "store-main" });
      if (navigator.onLine) await syncNow();
      else await refresh();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Transaksi belum dapat dicoba lagi.");
    }
  }, [refresh, storeId, syncNow, userId, isSessionRecovering]);

  useEffect(() => {
    refresh();
    if (navigator.onLine && userId) void syncNow();
    const retryTimer = window.setInterval(() => {
      if (navigator.onLine && userId) void syncNow();
    }, 60_000);
    const onQueueChange = () => refresh();
    const onSyncRequested = () => { if (navigator.onLine && userId) void syncNow(); };
    const onOnline = () => {
      setIsOnline(true);
      setError(null);
      void syncNow();
    };
    const onOffline = () => {
      setIsOnline(false);
      setError(null);
      void refresh();
    };

    window.addEventListener("pos-offline-queue-changed", onQueueChange);
    window.addEventListener("pos-offline-shift-changed", onQueueChange);
    window.addEventListener("pos-offline-sync-requested", onSyncRequested);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.clearInterval(retryTimer);
      window.removeEventListener("pos-offline-queue-changed", onQueueChange);
      window.removeEventListener("pos-offline-shift-changed", onQueueChange);
      window.removeEventListener("pos-offline-sync-requested", onSyncRequested);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh, syncNow, userId]);

  return {
    summary,
    isOnline,
    isSyncing,
    error,
    refresh,
    syncNow,
    clearSynced,
    records,
    shifts,
    retryRecord,
    currentIdentity: userId ? { cashierId: userId, storeId: storeId || "store-main" } : null,
  };
}
