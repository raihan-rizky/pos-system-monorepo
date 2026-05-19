"use client";

import { Bell } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useRole } from "@/components/providers/RoleProvider";

import { getLogger } from "@/lib/logger";

const log = getLogger("ui:NotificationPermissionPrompt");
const STORAGE_KEY = "pos_push_prompt_seen_v1";
const DEV_SW_PATH = "/sw.js";

export function NotificationPermissionPrompt() {
  const { role } = useRole();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!role || typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      log.info("[push-permission] Browser does not support notifications or service workers");
      return;
    }
    if (!("PushManager" in window)) {
      log.info("[push-permission] Browser does not support PushManager");
      return;
    }
    if (!window.isSecureContext) {
      log.info("[push-permission] Push notifications require HTTPS or localhost");
      return;
    }

    const isWaPage = pathname === "/wa" || pathname.startsWith("/wa/");
    if (Notification.permission === "granted") {
      setVisible(false);
      return;
    }

    if (isWaPage) {
      if (Notification.permission === "denied") {
        setMessage("Izin notifikasi diblokir. Aktifkan lagi dari site settings browser.");
      } else {
        setMessage(null);
      }
      setVisible(true);
      return;
    }

    if (Notification.permission !== "default") return;
    if (localStorage.getItem(STORAGE_KEY) === "1") return;
    setVisible(true);
  }, [pathname, role]);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  const enable = async () => {
    setIsEnabling(true);
    setMessage(null);

    try {
      if (!window.isSecureContext) {
        setMessage("Notifikasi browser hanya bisa aktif di HTTPS atau localhost.");
        return;
      }

      const permission = await Notification.requestPermission();
      log.info("[push-permission] Browser permission result", { permission });

      if (permission !== "granted") {
        setMessage(
          permission === "denied"
            ? "Izin notifikasi diblokir. Aktifkan lagi dari site settings browser."
            : "Browser belum memberikan izin notifikasi.",
        );
        return;
      }

      const applicationServerKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!applicationServerKey) {
        setMessage("VAPID public key belum dikonfigurasi.");
        return;
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
        throw new Error(`Failed to save push subscription: ${response.status}`);
      }

      localStorage.setItem(STORAGE_KEY, "1");
      setVisible(false);
    } catch (error) {
      log.error("[push-permission] Failed to enable push notifications", error);
      setMessage("Gagal mengaktifkan notifikasi. Cek console/server log untuk detail.");
    } finally {
      setIsEnabling(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[220] w-[min(360px,calc(100vw-2rem))] rounded-lg border border-surface-200 bg-white p-4 shadow-xl">
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Bell className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-bold text-surface-900">Aktifkan notifikasi</p>
          <p className="mt-1 text-sm text-surface-500">
            Dapatkan info closing deal, sync, approval, order, dan status produksi sesuai role Anda.
          </p>
          {message ? (
            <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-800">
              {message}
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void enable()}
              disabled={isEnabling}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-bold text-white"
            >
              {isEnabling ? "Enabling..." : "Enable"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              disabled={isEnabling}
              className="rounded-md border border-surface-200 px-3 py-1.5 text-xs font-bold text-surface-600"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
