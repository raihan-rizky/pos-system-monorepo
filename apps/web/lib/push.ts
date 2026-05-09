import webpush, { WebPushError } from "web-push";
import { db, type PushSubscription } from "@pos/db";

type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

type PushResult = {
  attempted: number;
  sent: number;
  failed: number;
  deactivated: number;
};

let vapidConfigured = false;

function configureVapid() {
  if (vapidConfigured) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

  if (!publicKey || !privateKey) {
    throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export async function sendPushToSubscriptions(
  subscriptions: PushSubscription[],
  payload: PushPayload,
): Promise<PushResult> {
  configureVapid();

  const result: PushResult = {
    attempted: subscriptions.length,
    sent: 0,
    failed: 0,
    deactivated: 0,
  };

  await Promise.all(
    subscriptions.map(async (subscription) => {
      if (!subscription.auth || !subscription.p256dh) {
        result.failed += 1;
        return;
      }

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              auth: subscription.auth,
              p256dh: subscription.p256dh,
            },
          },
          JSON.stringify(payload),
        );
        result.sent += 1;
      } catch (error) {
        result.failed += 1;

        if (isExpiredSubscription(error)) {
          await db.pushSubscription.update({
            where: { endpoint: subscription.endpoint },
            data: { isActive: false },
          });
          result.deactivated += 1;
        } else {
          console.error("[push] Failed to send notification", {
            endpoint: subscription.endpoint,
            error,
          });
        }
      }
    }),
  );

  return result;
}

function isExpiredSubscription(error: unknown) {
  if (error instanceof WebPushError) {
    return error.statusCode === 404 || error.statusCode === 410;
  }

  if (typeof error === "object" && error && "statusCode" in error) {
    const statusCode = Number((error as { statusCode?: unknown }).statusCode);
    return statusCode === 404 || statusCode === 410;
  }

  return false;
}
