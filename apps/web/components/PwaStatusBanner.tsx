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
    return () =>
      window.removeEventListener("pos-pwa-update-available", onUpdate);
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
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 top-3 z-[300] flex min-h-10 items-center justify-between gap-3 rounded-xl border border-rose-800 bg-rose-50 px-4 py-2 text-sm text-warning-900 shadow-lg shadow-warning-900/10 md:left-20 md:right-4"
    >
      <div className="flex min-w-0 items-center gap-2">
        {!isOnline ? (
          <WifiOff className="h-4 w-4 shrink-0" />
        ) : updateAvailable ? (
          <Download className="h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate font-medium">{message}</span>
      </div>
      <div className="flex items-center gap-2">
        {summary.pending > 0 && isOnline && (
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={isSyncing}
            className="inline-flex items-center gap-1 rounded-md bg-warning-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
            />
            Sync
          </button>
        )}
        {updateAvailable && (
          <button
            type="button"
            onClick={() => {
              navigator.serviceWorker.controller?.postMessage({
                type: "SKIP_WAITING",
              });
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
