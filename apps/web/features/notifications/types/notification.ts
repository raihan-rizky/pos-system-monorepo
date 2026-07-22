export const NOTIFICATIONS_UPDATED_EVENT = "pos:notifications-updated";

export type AppNotification = {
  id: string;
  eventName: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationInbox = {
  notifications: AppNotification[];
  unreadCount: number;
};
