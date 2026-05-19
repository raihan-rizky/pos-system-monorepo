import webpush, { WebPushError } from "web-push";
import { db, type PushSubscription } from "@pos/db";

import { getLogger } from "@/lib/logger";

const log = getLogger("lib:push");
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

function describeEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return `${url.hostname}...${endpoint.slice(-8)}`;
  } catch {
    return `invalid...${endpoint.slice(-8)}`;
  }
}

function describeError(error: unknown) {
  if (error instanceof WebPushError) {
    return {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode,
      body: error.body,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return error;
}

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

  log.info("[push] VAPID configured", { subject });
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

  log.info("[push] Sending notification batch", {
    attempted: result.attempted,
    title: payload.title,
    tag: payload.tag,
    url: payload.url,
  });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const endpoint = describeEndpoint(subscription.endpoint);

      if (!subscription.auth || !subscription.p256dh) {
        result.failed += 1;
        log.warn("[push] Skipping subscription with missing keys", {
          subscriptionId: subscription.id,
          endpoint,
          hasAuth: Boolean(subscription.auth),
          hasP256dh: Boolean(subscription.p256dh),
        });
        return;
      }

      try {
        log.info("[push] Sending notification", {
          subscriptionId: subscription.id,
          endpoint,
          role: subscription.role,
          storeId: subscription.storeId,
          tag: payload.tag,
        });

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
        log.info("[push] Notification sent", {
          subscriptionId: subscription.id,
          endpoint,
        });
      } catch (error) {
        result.failed += 1;

        if (isExpiredSubscription(error)) {
          await db.pushSubscription.update({
            where: { endpoint: subscription.endpoint },
            data: { isActive: false },
          });
          result.deactivated += 1;
          log.warn("[push] Deactivated expired subscription", {
            subscriptionId: subscription.id,
            endpoint,
            error: describeError(error),
          });
        } else {
          log.error("[push] Failed to send notification", {
            subscriptionId: subscription.id,
            endpoint,
            error: describeError(error),
          });
        }
      }
    }),
  );

  log.info("[push] Notification batch complete", result);

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
