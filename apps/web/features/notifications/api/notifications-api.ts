import type { NotificationInbox } from "../types/notification";

type ApiEnvelope<T> = { data?: T; message?: string };

async function parseResponse<T>(response: Response, fallbackMessage: string) {
  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || body.data === undefined) {
    throw new Error(body.message || fallbackMessage);
  }
  return body.data;
}

export async function fetchNotificationInbox() {
  const response = await fetch("/api/notifications?limit=30", {
    cache: "no-store",
  });
  return parseResponse<NotificationInbox>(response, "Gagal memuat notifikasi");
}

export async function markNotificationRead(id: string) {
  const response = await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
    method: "PATCH",
  });
  await parseResponse<{ id: string; read: boolean }>(
    response,
    "Gagal menandai notifikasi",
  );
}

export async function markAllNotificationsRead() {
  const response = await fetch("/api/notifications/read-all", {
    method: "POST",
  });
  await parseResponse<{ updated: number }>(
    response,
    "Gagal menandai semua notifikasi",
  );
}
