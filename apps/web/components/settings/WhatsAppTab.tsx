"use client";

import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Wifi, WifiOff, QrCode, AlertTriangle, CheckCircle2, UserCircle2 } from "lucide-react";
import { useWaStatus, useWaQr, WaStatus } from "@/hooks/useSettings";

function StatusBadge({ status }: { status: WaStatus }) {
  const config: Record<WaStatus, { label: string; dot: string; bg: string; text: string }> = {
    CONNECTED: { label: "Connected", dot: "bg-emerald-500", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700" },
    SCAN_QR_CODE: { label: "Waiting for Scan", dot: "bg-amber-500 animate-pulse", bg: "bg-amber-50 border-amber-200", text: "text-amber-700" },
    DISCONNECTED: { label: "Disconnected", dot: "bg-red-500", bg: "bg-red-50 border-red-200", text: "text-red-700" },
    UNKNOWN: { label: "Unknown", dot: "bg-surface-400", bg: "bg-surface-50 border-surface-200", text: "text-surface-600" },
    NOT_CONFIGURED: { label: "Not Configured", dot: "bg-surface-300", bg: "bg-surface-50 border-surface-200", text: "text-surface-500" },
  };
  const c = config[status] ?? config.UNKNOWN;

  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider ${c.bg} ${c.text}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export default function WhatsAppTab() {
  const queryClient = useQueryClient();
  const { data: statusData, isLoading: statusLoading } = useWaStatus();
  const { data: qrData, isFetching: qrFetching, isError: qrError, refetch: fetchQr } = useWaQr();

  const status = statusData?.status ?? "UNKNOWN";
  const isNotConfigured = status === "NOT_CONFIGURED";

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["settings", "wa-status"] });
    await fetchQr();
  };

  // Helper to safely parse phone number from me.id (e.g. "6281991029210@c.us" -> "6281991029210")
  const rawMe = statusData?.raw?.me as any;
  const waPhone = rawMe?.id?.split("@")[0] || null;
  const waName = rawMe?.pushName || "WhatsApp User";

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-bold text-surface-900">WhatsApp Integration</h2>
        <p className="text-sm text-surface-500 mt-0.5">Pair your WhatsApp account to enable automated notifications.</p>
      </div>

      {/* Not configured banner */}
      {isNotConfigured && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800 text-sm">WAHA not configured</p>
            <p className="text-xs text-amber-700 mt-1">
              Set <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">WAHA_BASE_URL</code> in your <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">.env</code> file to enable WhatsApp features.
            </p>
          </div>
        </div>
      )}

      {/* Status card */}
      {!isNotConfigured && (
        <div className="bg-white border border-surface-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {status === "CONNECTED"
                ? <Wifi className="w-5 h-5 text-emerald-600" />
                : <WifiOff className="w-5 h-5 text-surface-400" />
              }
              <span className="font-semibold text-surface-900 text-sm">Session Status</span>
            </div>
            {statusLoading
              ? <RefreshCw className="w-4 h-4 text-surface-400 animate-spin" />
              : <StatusBadge status={status} />
            }
          </div>

          {/* Connected state */}
          {status === "CONNECTED" && (
            <div className="flex flex-col gap-3 p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <p className="text-sm font-semibold text-emerald-800">Ready to send messages</p>
              </div>
              
              {rawMe && (
                <div className="flex items-center gap-3 pt-3 border-t border-emerald-100">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <UserCircle2 className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-surface-900">{waName}</p>
                    <p className="text-xs font-medium text-surface-500">+{waPhone}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* QR code section */}
          {(status === "SCAN_QR_CODE" || status === "DISCONNECTED" || status === "UNKNOWN") && (
            <div className="space-y-4">
              <p className="text-sm text-surface-600">
                Scan the QR code with WhatsApp on your phone to connect.
              </p>

              {qrFetching ? (
                <div className="flex flex-col items-center justify-center bg-surface-50 border border-surface-200 rounded-2xl h-52 gap-3">
                  <RefreshCw className="w-6 h-6 text-brand-400 animate-spin" />
                  <p className="text-xs text-surface-400">Fetching QR code…</p>
                </div>
              ) : qrError ? (
                <div className="flex flex-col items-center justify-center bg-red-50 border border-red-100 rounded-2xl h-52 gap-2">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                  <p className="text-xs text-red-600 font-medium">Failed to load QR. Click "Refresh QR" to try again.</p>
                </div>
              ) : qrData?.value ? (
                <div className="flex justify-center p-4 bg-white border border-surface-200 rounded-2xl shadow-sm">
                  <img
                    src={`data:image/png;base64,${qrData.value}`}
                    alt="WhatsApp QR Code"
                    className="w-48 h-48 object-contain"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center bg-surface-50 border-2 border-dashed border-surface-200 rounded-2xl h-52 gap-3 text-surface-400">
                  <QrCode className="w-10 h-10" />
                  <p className="text-xs">Click "Refresh QR" to generate a QR code</p>
                </div>
              )}

              <button
                onClick={handleRefresh}
                disabled={qrFetching}
                className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-surface-200 bg-white hover:bg-surface-50 text-surface-700 font-semibold text-sm transition-all hover:shadow-sm active:scale-95 disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${qrFetching ? "animate-spin" : ""}`} />
                Refresh QR
              </button>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-surface-400">
        QR codes expire after ~20 seconds. Click "Refresh QR" when ready to scan.
        Status auto-refreshes every 3 seconds.
      </p>
    </div>
  );
}
