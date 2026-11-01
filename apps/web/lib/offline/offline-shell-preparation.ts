"use client";

/** Load deferred app-shell code and the receipt module before an offline reopen. */
export async function warmOfflineShellModules() {
  await Promise.all([
    import("@/components/PwaStatusBanner"),
    import("@/components/InAppPushNotifications"),
    import("@/components/NotificationPermissionPrompt"),
    import("@/components/ServiceWorkerRegistration"),
    import("@/components/ReceiptModal"),
  ]);
}
