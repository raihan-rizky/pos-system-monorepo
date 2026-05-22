"use client";

import { RefreshCw, Trash2, Wifi } from "lucide-react";
import { useOfflineSync } from "@/hooks/useOfflineSync";

export default function OfflineSyncTab() {
  const { summary, isOnline, isSyncing, error, syncNow, clearSynced } = useOfflineSync();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-surface-900">Offline Sync</h2>
        <p className="mt-1 text-sm text-surface-500">
          Kelola transaksi offline yang tersimpan di perangkat ini.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Pending" value={summary.pending} />
        <Metric label="Syncing" value={summary.syncing} />
        <Metric label="Gagal" value={summary.failed} tone="danger" />
        <Metric label="Approval" value={summary.pendingApproval} />
      </div>

      <div className="rounded-lg border border-surface-100 bg-surface-50 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-600">
              <Wifi className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-surface-900">
                Status: {isOnline ? "Online" : "Offline"}
              </p>
              <p className="text-xs text-surface-500">
                Sync terakhir: {summary.lastSyncAt ? new Date(summary.lastSyncAt).toLocaleString("id-ID") : "-"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={!isOnline || isSyncing || summary.pending === 0}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            Sync sekarang
          </button>
        </div>
        {error && <p className="mt-3 text-sm font-medium text-danger-600">{error}</p>}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void clearSynced()}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-surface-200 px-4 text-sm font-semibold text-surface-700 hover:bg-surface-50"
        >
          <Trash2 className="h-4 w-4" />
          Hapus riwayat yang sudah sync
        </button>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-lg border border-surface-100 bg-white p-3">
      <p className="text-xs font-semibold uppercase text-surface-400">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${tone === "danger" ? "text-danger-600" : "text-surface-900"}`}>
        {value}
      </p>
    </div>
  );
}
