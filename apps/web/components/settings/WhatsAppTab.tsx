"use client";

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  KeyRound,
  QrCode,
  RefreshCw,
  Smartphone,
  UserCircle2,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  useWaPairCode,
  useWaQr,
  useWaStatus,
  type WaStatus,
} from "@/hooks/useSettings";
import { useRole } from "@/components/providers/RoleProvider";
import { shouldShowUpdateAction } from "@/features/rbac/helpers/rbac-ui";

function StatusBadge({ status }: { status: WaStatus }) {
  const config: Record<WaStatus, { label: string; dot: string; bg: string; text: string }> = {
    CONNECTED: { label: "Terhubung", dot: "bg-emerald-500", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700" },
    SCAN_QR_CODE: { label: "Menunggu Scan", dot: "bg-amber-500 animate-pulse", bg: "bg-amber-50 border-amber-200", text: "text-amber-700" },
    DISCONNECTED: { label: "Terputus", dot: "bg-red-500", bg: "bg-red-50 border-red-200", text: "text-red-700" },
    UNKNOWN: { label: "Belum Diketahui", dot: "bg-surface-400", bg: "bg-surface-50 border-surface-200", text: "text-surface-600" },
    NOT_CONFIGURED: { label: "Belum Diatur", dot: "bg-surface-300", bg: "bg-surface-50 border-surface-200", text: "text-surface-500" },
  };
  const c = config[status] ?? config.UNKNOWN;

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${c.bg} ${c.text}`}>
      <span className={`h-2 w-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

type WahaMe = {
  id?: string;
  pushName?: string;
};

function isWahaMe(value: unknown): value is WahaMe {
  return Boolean(value && typeof value === "object");
}

export default function WhatsAppTab() {
  const { canPerform } = useRole();
  const canUpdateWhatsApp = shouldShowUpdateAction("whatsapp", canPerform);
  const queryClient = useQueryClient();
  const { data: statusData, isLoading: statusLoading } = useWaStatus();
  const { data: qrData, isFetching: qrFetching, isError: qrError, refetch: fetchQr } = useWaQr();
  const pairCode = useWaPairCode();
  const [connectMethod, setConnectMethod] = useState<"qr" | "pair">("qr");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [copied, setCopied] = useState(false);

  const status = statusData?.status ?? "UNKNOWN";
  const isNotConfigured = status === "NOT_CONFIGURED";
  const rawMe = isWahaMe(statusData?.raw?.me) ? statusData.raw.me : null;
  const waPhone = rawMe?.id?.split("@")[0] || null;
  const waName = rawMe?.pushName || "Pengguna WhatsApp";

  const handleRefresh = async () => {
    if (!canUpdateWhatsApp) return;
    await queryClient.invalidateQueries({ queryKey: ["settings", "wa-status"] });
    await fetchQr();
  };

  const handlePairCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canUpdateWhatsApp) return;
    setCopied(false);
    await pairCode.mutateAsync({ phoneNumber });
    await queryClient.invalidateQueries({ queryKey: ["settings", "wa-status"] });
  };

  const handleCopyCode = async () => {
    if (!pairCode.data?.code) return;
    await navigator.clipboard.writeText(pairCode.data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-surface-900">Integrasi WhatsApp</h2>
        <p className="mt-0.5 text-sm text-surface-500">
          Hubungkan akun WhatsApp untuk mengaktifkan notifikasi otomatis.
        </p>
      </div>

      {isNotConfigured && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-800">WAHA belum diatur</p>
            <p className="mt-1 text-xs text-amber-700">
              Isi <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">WAHA_BASE_URL</code> di environment variables untuk mengaktifkan fitur WhatsApp.
            </p>
          </div>
        </div>
      )}

      {!isNotConfigured && (
        <div className="space-y-4 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {status === "CONNECTED" ? (
                <Wifi className="h-5 w-5 text-emerald-600" />
              ) : (
                <WifiOff className="h-5 w-5 text-surface-400" />
              )}
              <span className="text-sm font-semibold text-surface-900">Status Session</span>
            </div>
            {statusLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin text-surface-400" />
            ) : (
              <StatusBadge status={status} />
            )}
          </div>

          {status === "CONNECTED" && (
            <div className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800">Siap mengirim pesan</p>
              </div>

              {rawMe && (
                <div className="flex items-center gap-3 border-t border-emerald-100 pt-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <UserCircle2 className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-surface-900">{waName}</p>
                    {waPhone && <p className="text-xs font-medium text-surface-500">+{waPhone}</p>}
                  </div>
                </div>
              )}
            </div>
          )}

          {canUpdateWhatsApp && (status === "SCAN_QR_CODE" || status === "DISCONNECTED" || status === "UNKNOWN") && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-surface-200 bg-surface-50 p-1">
                <button
                  type="button"
                  onClick={() => setConnectMethod("qr")}
                  className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition-all ${connectMethod === "qr" ? "bg-white text-brand-700 shadow-sm" : "text-surface-500 hover:text-surface-800"}`}
                >
                  <QrCode className="h-4 w-4" />
                  Scan QR
                </button>
                <button
                  type="button"
                  onClick={() => setConnectMethod("pair")}
                  className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition-all ${connectMethod === "pair" ? "bg-white text-brand-700 shadow-sm" : "text-surface-500 hover:text-surface-800"}`}
                >
                  <Smartphone className="h-4 w-4" />
                  Pair Code
                </button>
              </div>

              {connectMethod === "qr" ? (
                <div className="space-y-4">
                  <p className="text-sm text-surface-600">
                    Scan kode QR dengan WhatsApp di ponsel untuk terhubung.
                  </p>

                  {qrFetching ? (
                    <div className="flex h-52 flex-col items-center justify-center gap-3 rounded-2xl border border-surface-200 bg-surface-50">
                      <RefreshCw className="h-6 w-6 animate-spin text-brand-400" />
                      <p className="text-xs text-surface-400">Mengambil kode QR...</p>
                    </div>
                  ) : qrError ? (
                    <div className="flex h-52 flex-col items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50">
                      <AlertTriangle className="h-6 w-6 text-red-500" />
                      <p className="text-xs font-medium text-red-600">Gagal memuat QR. Klik Refresh QR untuk mencoba lagi.</p>
                    </div>
                  ) : qrData?.value ? (
                    <div className="flex justify-center rounded-2xl border border-surface-200 bg-white p-4 shadow-sm">
                      <img
                        src={`data:image/png;base64,${qrData.value}`}
                        alt="Kode QR WhatsApp"
                        className="h-48 w-48 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex h-52 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-surface-200 bg-surface-50 text-surface-400">
                      <QrCode className="h-10 w-10" />
                      <p className="text-xs">Klik Refresh QR untuk membuat kode QR</p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={qrFetching}
                    className="flex min-h-[44px] items-center gap-2 rounded-xl border border-surface-200 bg-white px-4 py-2.5 text-sm font-semibold text-surface-700 transition-all hover:bg-surface-50 hover:shadow-sm active:scale-95 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${qrFetching ? "animate-spin" : ""}`} />
                    Refresh QR
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePairCode} className="space-y-4 rounded-2xl border border-surface-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-surface-900">Minta pairing code WhatsApp</p>
                      <p className="mt-0.5 text-xs text-surface-500">
                        Gunakan nomor telepon yang terdaftar di WhatsApp, termasuk kode negara.
                      </p>
                    </div>
                  </div>

                  <div>
                    <div>
                      <label htmlFor="wa-pair-phone" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-surface-500">
                        Nomor Telepon
                      </label>
                      <input
                        id="wa-pair-phone"
                        type="tel"
                        inputMode="tel"
                        value={phoneNumber}
                        onChange={(event) => setPhoneNumber(event.target.value)}
                        placeholder="628123456789"
                        className="min-h-[44px] w-full rounded-xl border border-surface-200 bg-surface-50 px-3 text-sm font-semibold text-surface-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
                      />
                    </div>
                  </div>

                  {pairCode.error && (
                    <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                      {pairCode.error instanceof Error ? pairCode.error.message : "Gagal meminta pairing code."}
                    </p>
                  )}

                  {pairCode.data?.code && (
                    <div className="flex flex-col gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Pairing Code</p>
                        <p className="mt-1 font-mono text-3xl font-black tracking-[0.18em] text-surface-950">
                          {pairCode.data.code}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-surface-950 px-4 text-sm font-bold text-white transition hover:bg-surface-800"
                      >
                        <Copy className="h-4 w-4" />
                        {copied ? "Tersalin" : "Salin"}
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={pairCode.isPending || phoneNumber.trim().length < 8}
                    className="flex min-h-[44px] items-center gap-2 rounded-xl bg-surface-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-surface-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${pairCode.isPending ? "animate-spin" : ""}`} />
                    Minta Code
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-surface-400">
        Kode QR kedaluwarsa sekitar 20 detik. Pairing code diminta dari WAHA session yang sama.
        Status otomatis diperbarui setiap 3 detik.
      </p>
    </div>
  );
}
