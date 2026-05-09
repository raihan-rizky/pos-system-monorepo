"use client";

import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useRole } from "@/components/providers/RoleProvider";

const STORAGE_KEY = "pos_push_prompt_seen_v1";

export function NotificationPermissionPrompt() {
  const { role } = useRole();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!role || typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem(STORAGE_KEY) === "1") return;
    setVisible(true);
  }, [role]);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  const enable = async () => {
    localStorage.setItem(STORAGE_KEY, "1");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setVisible(false);
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const applicationServerKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!applicationServerKey) {
      setVisible(false);
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(applicationServerKey),
    });

    await fetch("/api/push/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    setVisible(false);
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
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void enable()}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-bold text-white"
            >
              Enable
            </button>
            <button
              type="button"
              onClick={dismiss}
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

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
