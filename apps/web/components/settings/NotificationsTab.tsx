"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Volume2,
  VolumeX,
} from "lucide-react";

import { getLogger } from "@/lib/logger";
import {
  isNotificationSoundEnabled,
  playNotificationSound,
  setNotificationSoundEnabled,
} from "@/lib/notification-sound";
import {
  disablePushSubscription,
  enablePushSubscription,
  getPushSubscriptionState,
  type PushPermissionState,
} from "@/lib/push-subscription";

const log = getLogger("ui:settings:NotificationsTab");

const STORAGE_KEY = "pos_push_prompt_seen_v1";

export default function NotificationsTab() {
  const [permission, setPermission] = useState<PushPermissionState>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isSoundBusy, setIsSoundBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void refreshState();
    setSoundEnabled(isNotificationSoundEnabled());
  }, []);

  const enabled = permission === "granted" && isSubscribed;
  const blocked = permission === "denied";

  const handleToggle = async () => {
    setIsBusy(true);
    setMessage(null);

    try {
      if (enabled) {
        await disablePushSubscription();
        setIsSubscribed(false);
        setMessage("Notifikasi perangkat ini dinonaktifkan. Izin browser tetap bisa diubah dari site settings.");
        return;
      }

      await enablePushSubscription();
      setPermission("granted");
      setIsSubscribed(true);
      localStorage.setItem(STORAGE_KEY, "1");
      setMessage("Notifikasi aktif untuk perangkat ini.");
    } catch (error) {
      log.error("[push-settings] Failed to update notification setting", error);
      setMessage(error instanceof Error ? error.message : "Gagal memperbarui pengaturan notifikasi.");
      await refreshState();
    } finally {
      setIsBusy(false);
    }
  };

  const handleSoundToggle = async () => {
    setIsSoundBusy(true);
    setMessage(null);

    try {
      if (soundEnabled) {
        setNotificationSoundEnabled(false);
        setSoundEnabled(false);
        setMessage("Suara notifikasi dinonaktifkan.");
        return;
      }

      await playNotificationSound();
      setNotificationSoundEnabled(true);
      setSoundEnabled(true);
      setMessage("Suara notifikasi aktif.");
    } catch (error) {
      log.error("[push-settings] Failed to play notification sound", error);
      setNotificationSoundEnabled(false);
      setSoundEnabled(false);
      setMessage("Browser memblokir suara. Klik halaman ini lalu coba lagi.");
    } finally {
      setIsSoundBusy(false);
    }
  };

  async function refreshState() {
    if (typeof window === "undefined") return;

    const state = await getPushSubscriptionState();
    setPermission(state.permission);
    setIsSubscribed(state.isSubscribed);
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-surface-900">Notifikasi</h2>
        <p className="mt-0.5 text-sm text-surface-500">
          Kelola push notifications browser untuk perangkat ini.
        </p>
      </div>

      <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${enabled ? "bg-emerald-50 text-emerald-600" : "bg-surface-100 text-surface-500"}`}>
              {enabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-bold text-surface-900">Push notifications</p>
              <p className="mt-1 text-xs font-medium text-surface-500">
                {statusText(permission, isSubscribed)}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => void handleToggle()}
            disabled={isBusy || permission === "unsupported"}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${enabled ? "bg-brand-600" : "bg-surface-300"}`}
          >
            <span
              className={`absolute top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`}
            >
              {isBusy ? <Loader2 className="h-3 w-3 animate-spin text-surface-500" /> : null}
            </span>
          </button>
        </div>

        <div className="mt-5 border-t border-surface-100 pt-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${soundEnabled ? "bg-brand-50 text-brand-600" : "bg-surface-100 text-surface-500"}`}>
                {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-sm font-bold text-surface-900">Suara notifikasi</p>
                <p className="mt-1 text-xs font-medium text-surface-500">
                  {soundEnabled
                    ? "Suara aktif untuk notifikasi di tab yang sedang terbuka."
                    : "Suara nonaktif."}
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={soundEnabled}
              onClick={() => void handleSoundToggle()}
              disabled={isSoundBusy}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${soundEnabled ? "bg-brand-600" : "bg-surface-300"}`}
            >
              <span
                className={`absolute top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform ${soundEnabled ? "translate-x-6" : "translate-x-1"}`}
              >
                {isSoundBusy ? <Loader2 className="h-3 w-3 animate-spin text-surface-500" /> : null}
              </span>
            </button>
          </div>
        </div>

        {blocked ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs font-medium text-amber-800">
              Izin notifikasi browser diblokir. Aktifkan dari pengaturan browser untuk situs ini, lalu kembali ke sini.
            </p>
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-surface-200 bg-surface-50 p-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <p className="text-xs font-medium text-surface-700">{message}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function statusText(permission: PushPermissionState, subscribed: boolean) {
  if (permission === "unsupported") return "Browser ini tidak mendukung push notifications.";
  if (permission === "denied") return "Permission diblokir di pengaturan browser.";
  if (permission === "default") return "Permission belum diminta.";
  if (subscribed) return "Permission diberikan dan perangkat ini sudah subscribed.";
  return "Permission diberikan, tetapi perangkat ini belum subscribed.";
}
