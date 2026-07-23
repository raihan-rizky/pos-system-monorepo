"use client";

import {
  type CSSProperties,
  type PointerEventHandler,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bell,
  CheckCheck,
  ChevronRight,
  EyeOff,
  Inbox,
  Package,
  ReceiptText,
  ShoppingCart,
} from "lucide-react";

import type { AppNotification } from "../types/notification";
import {
  clampNotificationY,
  DEFAULT_NOTIFICATION_FLOATING_PREFERENCE,
  NOTIFICATION_FLOATING_PREFERENCE_KEY,
  parseNotificationFloatingPreference,
  snapNotificationEdge,
  type NotificationFloatingPreference,
} from "../helpers/notification-floating-control";
import { useNotifications } from "./NotificationProvider";

type NotificationCenterViewProps = {
  open: boolean;
  unreadCount: number;
  notifications: AppNotification[];
  preference: NotificationFloatingPreference;
  viewportHeight?: number;
  dragging: boolean;
  dragPosition?: { x: number; y: number } | null;
  error?: string | null;
  onToggle: () => void;
  onHide: () => void;
  onRestore: () => void;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onPointerMove?: PointerEventHandler<HTMLButtonElement>;
  onPointerUp?: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel?: PointerEventHandler<HTMLButtonElement>;
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

const FLOATING_CONTROL_HEIGHT = 44;
const DRAG_THRESHOLD_PX = 5;

type DragSession = {
  pointerId: number;
  startPointerX: number;
  startPointerY: number;
  startLeft: number;
  startTop: number;
  width: number;
  moved: boolean;
};

export function NotificationCenterView({
  open,
  unreadCount,
  notifications,
  preference,
  viewportHeight = 0,
  dragging,
  dragPosition = null,
  error = null,
  onToggle,
  onHide,
  onRestore,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onOpenNotification,
  onMarkAllAsRead,
}: NotificationCenterViewProps) {
  const edgeClass = dragPosition
    ? ""
    : preference.edge === "left"
      ? "left-0"
      : "right-0";
  const floatingStyle: CSSProperties = dragPosition
    ? { left: dragPosition.x, top: dragPosition.y }
    : { top: preference.y };
  const panelOpensUp =
    viewportHeight > 0 &&
    preference.y + FLOATING_CONTROL_HEIGHT / 2 > viewportHeight / 2;
  const panelMaxHeight =
    viewportHeight > 0
      ? Math.min(
          560,
          Math.max(
            0,
            panelOpensUp
              ? preference.y - 20
              : viewportHeight -
                  preference.y -
                  FLOATING_CONTROL_HEIGHT -
                  20,
          ),
        )
      : undefined;

  if (preference.hidden) {
    const edgeShapeClass =
      preference.edge === "left"
        ? "rounded-r-xl border-l-0 hover:translate-x-1 focus-visible:translate-x-1"
        : "rounded-l-xl border-r-0 hover:-translate-x-1 focus-visible:-translate-x-1";

    return (
      <div
        className={`fixed z-[130] ${edgeClass}`}
        style={floatingStyle}
      >
        <button
          type="button"
          aria-label="Tampilkan notifikasi"
          onClick={onRestore}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className={`group flex h-11 w-7 touch-none cursor-grab items-center justify-center border border-surface-200 bg-white text-surface-600 shadow-lg transition duration-200 hover:scale-105 hover:text-brand-700 hover:shadow-xl focus-visible:scale-105 focus-visible:text-brand-700 focus-visible:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 active:cursor-grabbing motion-reduce:transform-none ${edgeShapeClass} ${
            dragging ? "cursor-grabbing" : ""
          }`}
        >
          <ChevronRight
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5 motion-reduce:transform-none"
            aria-hidden="true"
          />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`group fixed z-[130] flex items-center gap-1 ${
        preference.edge === "left" ? "flex-row" : "flex-row-reverse"
      } ${edgeClass}`}
      style={floatingStyle}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={
          unreadCount > 0
            ? `Notifikasi, ${unreadCount} belum dibaca`
            : "Notifikasi"
        }
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className={`relative flex h-11 w-11 touch-none cursor-grab items-center justify-center rounded-full border bg-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl active:cursor-grabbing motion-reduce:transform-none ${
          unreadCount > 0
            ? "border-red-200 text-red-600"
            : "border-surface-200 text-surface-600"
        } ${dragging ? "cursor-grabbing" : ""}`}
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

      <button
        type="button"
        onClick={onHide}
        aria-label="Sembunyikan notifikasi"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-surface-200 bg-white text-surface-500 opacity-0 shadow-md transition duration-200 hover:scale-105 hover:text-brand-700 focus-visible:scale-105 focus-visible:text-brand-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transform-none"
      >
        <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open ? (
        <section
          aria-label="Pusat notifikasi"
          style={panelMaxHeight === undefined ? undefined : { maxHeight: panelMaxHeight }}
          className={`absolute flex max-h-[min(560px,75vh)] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-2xl ${
            panelOpensUp ? "bottom-full mb-3" : "top-full mt-3"
          } ${
            preference.edge === "left" ? "left-0" : "right-0"
          }`}
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
  const [preference, setPreference] = useState<NotificationFloatingPreference>(
    { ...DEFAULT_NOTIFICATION_FLOATING_PREFERENCE },
  );
  const [hydrated, setHydrated] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const latestDragPositionRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntilRef = useRef(0);
  const inbox = useNotifications();

  useEffect(() => {
    let storedPreference: NotificationFloatingPreference = {
      ...DEFAULT_NOTIFICATION_FLOATING_PREFERENCE,
    };
    try {
      storedPreference = parseNotificationFloatingPreference(
        window.localStorage.getItem(NOTIFICATION_FLOATING_PREFERENCE_KEY),
      );
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }

    setPreference({
      ...storedPreference,
      y: clampNotificationY(
        storedPreference.y,
        window.innerHeight,
        FLOATING_CONTROL_HEIGHT,
      ),
    });
    setViewportHeight(window.innerHeight);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        NOTIFICATION_FLOATING_PREFERENCE_KEY,
        JSON.stringify(preference),
      );
    } catch {
      // Keep the current-session interaction working when persistence fails.
    }
  }, [hydrated, preference]);

  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
      setPreference((current) => ({
        ...current,
        y: clampNotificationY(
          current.y,
          window.innerHeight,
          FLOATING_CONTROL_HEIGHT,
        ),
      }));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const shouldSuppressClick = () => {
    if (Date.now() > suppressClickUntilRef.current) return false;
    suppressClickUntilRef.current = 0;
    return true;
  };

  const handlePointerDown: PointerEventHandler<HTMLButtonElement> = (event) => {
    if (event.button !== 0) return;

    const floatingRoot =
      event.currentTarget.parentElement?.getBoundingClientRect() ??
      event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragSessionRef.current = {
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startLeft: floatingRoot.left,
      startTop: floatingRoot.top,
      width: floatingRoot.width,
      moved: false,
    };
  };

  const handlePointerMove: PointerEventHandler<HTMLButtonElement> = (event) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - session.startPointerX;
    const deltaY = event.clientY - session.startPointerY;
    if (
      !session.moved &&
      Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX
    ) {
      return;
    }

    session.moved = true;
    setDragging(true);
    setOpen(false);

    const nextPosition = {
      x: Math.min(
        Math.max(session.startLeft + deltaX, 8),
        Math.max(8, window.innerWidth - session.width - 8),
      ),
      y: clampNotificationY(
        session.startTop + deltaY,
        window.innerHeight,
        FLOATING_CONTROL_HEIGHT,
      ),
    };
    latestDragPositionRef.current = nextPosition;
    setDragPosition(nextPosition);
  };

  const finishPointerDrag = (
    event: Parameters<PointerEventHandler<HTMLButtonElement>>[0],
    commit: boolean,
  ) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (session.moved) {
      suppressClickUntilRef.current = Date.now() + 300;
      if (commit) {
        const finalPosition = latestDragPositionRef.current;
        setPreference((current) => ({
          ...current,
          edge: snapNotificationEdge(event.clientX, window.innerWidth),
          y: clampNotificationY(
            finalPosition?.y ?? current.y,
            window.innerHeight,
            FLOATING_CONTROL_HEIGHT,
          ),
        }));
      }
    }

    dragSessionRef.current = null;
    latestDragPositionRef.current = null;
    setDragPosition(null);
    setDragging(false);
  };

  const handlePointerUp: PointerEventHandler<HTMLButtonElement> = (event) => {
    finishPointerDrag(event, true);
  };

  const handlePointerCancel: PointerEventHandler<HTMLButtonElement> = (
    event,
  ) => {
    finishPointerDrag(event, false);
  };

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
        preference={preference}
        viewportHeight={viewportHeight}
        dragging={dragging}
        dragPosition={dragPosition}
        error={inbox.error}
        onToggle={() => {
          if (shouldSuppressClick()) return;
          setOpen((current) => !current);
        }}
        onHide={() => {
          setOpen(false);
          setPreference((current) => ({ ...current, hidden: true }));
        }}
        onRestore={() => {
          if (shouldSuppressClick()) return;
          setPreference((current) => ({ ...current, hidden: false }));
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onOpenNotification={(notification) => void openNotification(notification)}
        onMarkAllAsRead={() => void inbox.markAllAsRead()}
      />
    </div>
  );
}
