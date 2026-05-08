"use client";

import { RefreshCw, WifiOff, AlertTriangle, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useOfflineSync } from "@/hooks/useOfflineSync";

export function PwaStatusBanner() {
  const { summary, isOnline, isSyncing, error, syncNow } = useOfflineSync();
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const onUpdate = () => setUpdateAvailable(true);
    window.addEventListener("pos-pwa-update-available", onUpdate);
    return () => window.removeEventListener("pos-pwa-update-available", onUpdate);
  }, []);

  if (
    isOnline &&
    !isSyncing &&
    !error &&
    !updateAvailable &&
    summary.pending === 0 &&
    summary.failed === 0
  ) {
    return null;
  }

  const message = !isOnline
    ? `Offline mode: ${summary.pending} transaksi akan sync nanti`
    : isSyncing
      ? `Syncing ${summary.pending} transaksi...`
      : error || summary.failed > 0
        ? `${summary.failed || 1} transaksi perlu perhatian`
        : updateAvailable
          ? "Versi baru tersedia"
          : `${summary.pending} transaksi menunggu sync`;

  return (
    <div className="sticky top-0 z-[120] flex min-h-10 items-center justify-between gap-3 border-b border-warning-200 bg-warning-50 px-4 py-2 text-sm text-warning-900">
      <div className="flex items-center gap-2">
        {!isOnline ? (
          <WifiOff className="h-4 w-4" />
        ) : updateAvailable ? (
          <Download className="h-4 w-4" />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )}
        <span className="font-medium">{message}</span>
      </div>
      <div className="flex items-center gap-2">
        {summary.pending > 0 && isOnline && (
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={isSyncing}
            className="inline-flex items-center gap-1 rounded-md bg-warning-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            Sync
          </button>
        )}
        {updateAvailable && (
          <button
            type="button"
            onClick={() => {
              navigator.serviceWorker.controller?.postMessage({ type: "SKIP_WAITING" });
              window.location.reload();
            }}
            className="rounded-md bg-surface-900 px-2.5 py-1 text-xs font-bold text-white"
          >
            Refresh
          </button>
        )}
      </div>
    </div>
  );
}
