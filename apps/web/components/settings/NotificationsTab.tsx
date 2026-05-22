"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";

import { getLogger } from "@/lib/logger";

const log = getLogger("ui:settings:NotificationsTab");
type PermissionState = NotificationPermission | "unsupported";

const DEV_SW_PATH = "/sw.js";
const STORAGE_KEY = "pos_push_prompt_seen_v1";

export default function NotificationsTab() {
  const [permission, setPermission] = useState<PermissionState>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void refreshState();
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

  async function refreshState() {
    if (typeof window === "undefined") return;

    if (!supportsPushNotifications()) {
      setPermission("unsupported");
      setIsSubscribed(false);
      return;
    }

    setPermission(Notification.permission);

    if (!window.isSecureContext || Notification.permission !== "granted") {
      setIsSubscribed(false);
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    setIsSubscribed(Boolean(subscription));
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

async function enablePushSubscription() {
  if (!supportsPushNotifications()) {
    throw new Error("Browser ini tidak mendukung push notifications.");
  }

  if (!window.isSecureContext) {
    throw new Error("Notifikasi browser hanya bisa aktif di HTTPS atau localhost.");
  }

  const permission = await Notification.requestPermission();
  log.info("[push-settings] Browser permission result", { permission });

  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Izin notifikasi diblokir. Aktifkan lagi dari site settings browser."
        : "Browser belum memberikan izin notifikasi.",
    );
  }

  const applicationServerKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!applicationServerKey) {
    throw new Error("VAPID public key belum dikonfigurasi.");
  }

  const registration = await getServiceWorkerRegistration();
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(applicationServerKey),
    }));

  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!response.ok) {
    throw new Error(`Gagal menyimpan push subscription: ${response.status}`);
  }
}

async function disablePushSubscription() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  const response = await fetch("/api/push/subscriptions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });

  if (!response.ok) {
    throw new Error(`Gagal menonaktifkan push subscription: ${response.status}`);
  }
}

async function getServiceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;

  const registration = await navigator.serviceWorker.register(DEV_SW_PATH, {
    scope: "/",
  });
  await navigator.serviceWorker.ready;
  return registration;
}

function supportsPushNotifications() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function statusText(permission: PermissionState, subscribed: boolean) {
  if (permission === "unsupported") return "Browser ini tidak mendukung push notifications.";
  if (permission === "denied") return "Permission diblokir di pengaturan browser.";
  if (permission === "default") return "Permission belum diminta.";
  if (subscribed) return "Permission diberikan dan perangkat ini sudah subscribed.";
  return "Permission diberikan, tetapi perangkat ini belum subscribed.";
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
