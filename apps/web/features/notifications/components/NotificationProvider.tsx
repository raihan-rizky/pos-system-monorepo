"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useRole } from "@/components/providers/RoleProvider";
import {
  fetchNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api/notifications-api";
import {
  NOTIFICATIONS_UPDATED_EVENT,
  type AppNotification,
  type NotificationInbox,
} from "../types/notification";

type NotificationContextValue = NotificationInbox & {
  isLoading: boolean;
  error: string | null;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
};

const EMPTY_INBOX: NotificationInbox = {
  notifications: [],
  unreadCount: 0,
};

const NotificationContext = createContext<NotificationContextValue>({
  ...EMPTY_INBOX,
  isLoading: false,
  error: null,
  markAsRead: async () => undefined,
  markAllAsRead: async () => undefined,
  refresh: async () => undefined,
});

export function NotificationProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const { userId } = useRole();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["notification-inbox", userId], [userId]);
  const {
    data,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: fetchNotificationInbox,
    enabled: enabled && Boolean(userId),
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const updateInbox = useCallback(
    (updater: (current: NotificationInbox) => NotificationInbox) => {
      queryClient.setQueryData<NotificationInbox>(queryKey, (current) =>
        updater(current || EMPTY_INBOX),
      );
    },
    [queryClient, queryKey],
  );

  const markAsRead = useCallback(async (id: string) => {
    await markNotificationRead(id);
    const readAt = new Date().toISOString();
    updateInbox((current) => {
      const target = current.notifications.find((item) => item.id === id);
      return {
        notifications: current.notifications.map((item) =>
          item.id === id ? { ...item, readAt: item.readAt || readAt } : item,
        ),
        unreadCount:
          target && !target.readAt
            ? Math.max(0, current.unreadCount - 1)
            : current.unreadCount,
      };
    });
  }, [updateInbox]);

  const markAllAsRead = useCallback(async () => {
    await markAllNotificationsRead();
    const readAt = new Date().toISOString();
    updateInbox((current) => ({
      notifications: current.notifications.map((item) => ({
        ...item,
        readAt: item.readAt || readAt,
      })),
      unreadCount: 0,
    }));
  }, [updateInbox]);

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const handleUpdate = () => void refetch();
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, handleUpdate);
  }, [enabled, refetch]);

  const value: NotificationContextValue = {
    ...(data || EMPTY_INBOX),
    isLoading,
    error: queryError instanceof Error ? queryError.message : null,
    markAsRead,
    markAllAsRead,
    refresh,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}

export type { AppNotification, NotificationContextValue };
