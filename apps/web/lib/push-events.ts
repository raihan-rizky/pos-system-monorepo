import { db, type PushSubscription, type Role } from "@pos/db";

import { getLogger } from "@/lib/logger";
import {
  sendPushToSubscriptions,
  type PushPayload,
  type PushResult,
} from "@/lib/push";

const log = getLogger("lib:push-events");

type PushFeatureKey =
  | "closingDeals"
  | "inventoryRequests"
  | "pendingTransactions"
  | "shoppingRequests";

type SendRolePushEventInput = {
  eventName: string;
  storeId: string | null;
  roles: Role[];
  featureKey: PushFeatureKey;
  excludeUserIds?: string[];
  payload: PushPayload;
};

export type RolePushEventResult = PushResult & {
  activeCandidates: number;
  recipients: number;
};

const EMPTY_RESULT: PushResult = {
  attempted: 0,
  sent: 0,
  failed: 0,
  deactivated: 0,
};

export async function sendRolePushEvent({
  eventName,
  storeId,
  roles,
  featureKey,
  excludeUserIds = [],
  payload,
}: SendRolePushEventInput): Promise<RolePushEventResult> {
  try {
    const users = await db.user.findMany({
      where: {
        isActive: true,
        role: { in: roles },
        ...(storeId ? { storeId } : {}),
        ...(excludeUserIds.length > 0
          ? { id: { notIn: excludeUserIds } }
          : {}),
      },
      select: { id: true },
    });

    if (users.length > 0) {
      await db.notification.createMany({
        data: users.map((user) => ({
          userId: user.id,
          storeId,
          eventName,
          title: payload.title,
          body: payload.body,
          url: payload.url || null,
          tag: payload.tag || eventName,
        })),
        skipDuplicates: true,
      });
    }

    log.info("[push-event] Persistent inbox updated", {
      eventName,
      storeId,
      recipients: users.length,
    });
  } catch (error) {
    // A browser push should still be attempted if the persistent inbox has a
    // temporary problem. Both channels are useful, but neither gates the event.
    log.error("[push-event] Failed to update persistent inbox", {
      eventName,
      storeId,
      error,
    });
  }

  const subscriptions = await db.pushSubscription.findMany({
    where: {
      isActive: true,
      role: { in: roles },
      ...(storeId ? { storeId } : {}),
    },
  });
  const selected = subscriptions.filter((subscription) =>
    wantsFeature(subscription, featureKey),
  );

  log.info("[push-event] Recipients selected", {
    eventName,
    storeId,
    roles,
    featureKey,
    activeCandidates: subscriptions.length,
    recipients: selected.length,
    filteredOut: subscriptions.length - selected.length,
    tag: payload.tag,
    url: payload.url,
  });

  if (selected.length === 0) {
    const result = {
      ...EMPTY_RESULT,
      activeCandidates: subscriptions.length,
      recipients: 0,
    };
    log.info("[push-event] No recipients for event", {
      eventName,
      storeId,
      roles,
      featureKey,
      ...result,
    });
    return result;
  }

  const result = await sendPushToSubscriptions(selected, payload);

  log.info("[push-event] Event delivered", {
    eventName,
    storeId,
    roles,
    featureKey,
    activeCandidates: subscriptions.length,
    recipients: selected.length,
    ...result,
  });

  return {
    ...result,
    activeCandidates: subscriptions.length,
    recipients: selected.length,
  };
}

export function wantsFeature(
  subscription: Pick<PushSubscription, "features">,
  featureKey: PushFeatureKey,
) {
  if (!subscription.features || typeof subscription.features !== "object") {
    return true;
  }

  const features = subscription.features as Record<string, unknown>;
  return features[featureKey] !== false;
}
