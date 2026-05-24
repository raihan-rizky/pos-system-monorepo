export type PushPermissionState = NotificationPermission | "unsupported";

const SERVICE_WORKER_PATH = "/sw.js";

export function supportsPushNotifications() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function getPushSubscriptionState(): Promise<{
  permission: PushPermissionState;
  isSubscribed: boolean;
}> {
  if (!supportsPushNotifications()) {
    return { permission: "unsupported", isSubscribed: false };
  }

  const permission = Notification.permission;
  if (!window.isSecureContext || permission !== "granted") {
    return { permission, isSubscribed: false };
  }

  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  return { permission, isSubscribed: Boolean(subscription) };
}

export async function enablePushSubscription() {
  if (!supportsPushNotifications()) {
    throw new Error("Browser ini tidak mendukung push notifications.");
  }

  if (!window.isSecureContext) {
    throw new Error("Notifikasi browser hanya bisa aktif di HTTPS atau localhost.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Izin notifikasi diblokir. Aktifkan lagi dari site settings browser."
        : "Browser belum memberikan izin notifikasi.",
    );
  }

  await ensurePushSubscriptionSaved();
}

export async function ensurePushSubscriptionSaved() {
  if (!supportsPushNotifications()) {
    throw new Error("Browser ini tidak mendukung push notifications.");
  }

  if (!window.isSecureContext) {
    throw new Error("Notifikasi browser hanya bisa aktif di HTTPS atau localhost.");
  }

  if (Notification.permission !== "granted") {
    throw new Error("Browser belum memberikan izin notifikasi.");
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

export async function disablePushSubscription() {
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

  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
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
