"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCheck,
  Inbox,
  Package,
  ReceiptText,
  ShoppingCart,
} from "lucide-react";

import type { AppNotification } from "../types/notification";
import { useNotifications } from "./NotificationProvider";

type NotificationCenterViewProps = {
  open: boolean;
  unreadCount: number;
  notifications: AppNotification[];
  error?: string | null;
  onToggle: () => void;
  onOpenNotification: (notification: AppNotification) => void;
  onMarkAllAsRead: () => void;
};

function notificationIcon(eventName: string) {
  if (eventName.includes("shopping-request")) return ShoppingCart;
  if (eventName.includes("inventory")) return Package;
  if (eventName.includes("transaction")) return ReceiptText;
  return Bell;
}

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function NotificationCenterView({
  open,
  unreadCount,
  notifications,
  error = null,
  onToggle,
  onOpenNotification,
  onMarkAllAsRead,
}: NotificationCenterViewProps) {
  return (
    <div className="fixed right-4 top-4 z-[130] md:right-7 md:top-6">
      <button
        type="button"
        onClick={onToggle}
        aria-label={unreadCount > 0 ? `Notifikasi, ${unreadCount} belum dibaca` : "Notifikasi"}
        aria-expanded={open}
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border bg-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl ${
          unreadCount > 0
            ? "border-red-200 text-red-600"
            : "border-surface-200 text-surface-600"
        }`}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            aria-label={`${unreadCount} notifikasi belum dibaca`}
            className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white ring-2 ring-white"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          aria-label="Pusat notifikasi"
          className="absolute right-0 mt-3 flex max-h-[min(560px,75vh)] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-2xl"
        >
          <header className="flex items-start justify-between gap-4 border-b border-surface-100 px-4 py-3.5">
            <div>
              <h2 className="font-black text-surface-900">Notifikasi</h2>
              <p className="mt-0.5 text-xs text-surface-500">
                {unreadCount > 0
                  ? `${unreadCount} update masih perlu kamu cek.`
                  : "Semua update sudah dibaca."}
              </p>
            </div>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={onMarkAllAsRead}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-50"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Tandai semua dibaca
              </button>
            ) : null}
          </header>

          <div className="overflow-y-auto">
            {error ? (
              <p className="m-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            ) : null}
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-12 text-center text-surface-500">
                <Inbox className="mb-3 h-8 w-8 text-surface-300" aria-hidden="true" />
                <p className="text-sm font-bold text-surface-700">Belum ada notifikasi</p>
                <p className="mt-1 text-xs">Update penting bakal muncul di sini.</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const Icon = notificationIcon(notification.eventName);
                const unread = !notification.readAt;
                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => onOpenNotification(notification)}
                    className={`flex w-full gap-3 border-b border-surface-100 px-4 py-3.5 text-left transition last:border-b-0 hover:bg-surface-50 ${
                      unread ? "bg-red-50/45" : "bg-white"
                    }`}
                  >
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      unread ? "bg-red-100 text-red-600" : "bg-surface-100 text-surface-500"
                    }`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        <span className={`flex-1 text-sm ${unread ? "font-black text-surface-900" : "font-bold text-surface-700"}`}>
                          {notification.title}
                        </span>
                        {unread ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-600" aria-hidden="true" /> : null}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-surface-600">
                        {notification.body}
                      </span>
                      <span className="mt-1.5 block text-[10px] font-semibold text-surface-400">
                        {formatNotificationTime(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inbox = useNotifications();

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const openNotification = async (notification: AppNotification) => {
    if (!notification.readAt) {
      try {
        await inbox.markAsRead(notification.id);
      } catch {
        // The destination is still useful when the read-state request fails.
        // The item stays unread and can be retried on the next inbox refresh.
      }
    }
    setOpen(false);
    window.location.assign(
      notification.url?.startsWith("/") ? notification.url : "/dashboard",
    );
  };

  return (
    <div ref={rootRef}>
      <NotificationCenterView
        open={open}
        unreadCount={inbox.unreadCount}
        notifications={inbox.notifications}
        error={inbox.error}
        onToggle={() => setOpen((current) => !current)}
        onOpenNotification={(notification) => void openNotification(notification)}
        onMarkAllAsRead={() => void inbox.markAllAsRead()}
      />
    </div>
  );
}
