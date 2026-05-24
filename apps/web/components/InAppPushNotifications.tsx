"use client";

import { Bell, ExternalLink, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getLogger } from "@/lib/logger";
import {
  isNotificationSoundEnabled,
  playNotificationSound,
} from "@/lib/notification-sound";

const log = getLogger("ui:InAppPushNotifications");
type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
};

type PushMessage = {
  type?: string;
  payload?: PushPayload;
};

type InAppNotification = {
  id: string;
  title: string;
  body: string;
  url: string;
};

const DEFAULT_NOTIFICATION: InAppNotification = {
  id: "latest",
  title: "POS System",
  body: "Ada notifikasi baru.",
  url: "/dashboard",
};

export function InAppPushNotifications() {
  const [notification, setNotification] = useState<InAppNotification | null>(
    null,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const onMessage = (event: MessageEvent<PushMessage>) => {
      if (event.data?.type !== "POS_PUSH_NOTIFICATION") return;

      const payload = event.data.payload || {};
      log.info("[push][client] Notification received from service worker", {
        title: payload.title || DEFAULT_NOTIFICATION.title,
        tag: payload.tag,
        url: payload.url || DEFAULT_NOTIFICATION.url,
      });
      setNotification({
        id: `${payload.tag || "push"}:${Date.now()}`,
        title: payload.title || DEFAULT_NOTIFICATION.title,
        body: payload.body || DEFAULT_NOTIFICATION.body,
        url: payload.url || DEFAULT_NOTIFICATION.url,
      });

      if (isNotificationSoundEnabled()) {
        void playNotificationSound().catch((error) => {
          log.warn("[push][client] Notification sound failed", { error });
        });
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!notification) return;

    const timeout = window.setTimeout(() => {
      setNotification(null);
    }, 12000);

    return () => window.clearTimeout(timeout);
  }, [notification]);

  const actionLabel = useMemo(() => {
    if (!notification?.url) return "Buka";
    return notification.url.startsWith("/wa") ? "Buka chat" : "Buka";
  }, [notification?.url]);

  if (!notification) return null;

  return (
    <div
      key={notification.id}
      role="status"
      aria-live="polite"
      className="fixed right-4 top-4 z-[360] w-[min(380px,calc(100vw-2rem))] rounded-lg border border-brand-200 bg-white p-4 shadow-xl shadow-surface-900/10"
    >
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Bell className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-bold text-surface-900">
              {notification.title}
            </p>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-surface-400 hover:bg-surface-100 hover:text-surface-700"
              aria-label="Tutup notifikasi"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 line-clamp-3 text-sm text-surface-600">
            {notification.body}
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.assign(notification.url);
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
