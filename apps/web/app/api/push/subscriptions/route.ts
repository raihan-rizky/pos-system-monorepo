import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "@pos/db";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:push:subscriptions");
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    auth: z.string().optional(),
    p256dh: z.string().optional(),
  }).optional(),
  features: z.record(z.string(), z.boolean()).optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function POST(request: Request) {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY");
    const body = await request.json();
    const parsed = subscriptionSchema.safeParse(body);

    if (!parsed.success) {
      log.warn("[POST /api/push/subscriptions] Validation failed", {
        userId: user.id,
        role: user.role,
        errors: parsed.error.flatten(),
      });
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const endpointDescription = describeEndpoint(parsed.data.endpoint);
    log.info("[POST /api/push/subscriptions] Saving subscription", {
      userId: user.id,
      role: user.role,
      storeId: user.storeId,
      endpoint: endpointDescription,
      hasAuth: Boolean(parsed.data.keys?.auth),
      hasP256dh: Boolean(parsed.data.keys?.p256dh),
      featureKeys: parsed.data.features ? Object.keys(parsed.data.features) : [],
    });

    const features = getSubscriptionFeatures(parsed.data.features, user.role);
    const [subscription] = await db.$queryRaw<
      Array<{ id: string; isActive: boolean }>
    >`
      INSERT INTO "pos_push_subscriptions" (
        "id",
        "endpoint",
        "userId",
        "role",
        "storeId",
        "auth",
        "p256dh",
        "features",
        "isActive",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${`push_${randomUUID()}`},
        ${parsed.data.endpoint},
        ${user.id},
        ${user.role}::"Role",
        ${user.storeId || null},
        ${parsed.data.keys?.auth || null},
        ${parsed.data.keys?.p256dh || null},
        ${JSON.stringify(features)}::jsonb,
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT ("endpoint") DO UPDATE SET
        "userId" = EXCLUDED."userId",
        "role" = EXCLUDED."role",
        "storeId" = EXCLUDED."storeId",
        "auth" = EXCLUDED."auth",
        "p256dh" = EXCLUDED."p256dh",
        "features" = EXCLUDED."features",
        "isActive" = true,
        "updatedAt" = NOW()
      RETURNING "id", "isActive"
    `;

    log.info("[POST /api/push/subscriptions] Subscription saved", {
      subscriptionId: subscription.id,
      userId: user.id,
      role: user.role,
      storeId: user.storeId,
      endpoint: endpointDescription,
      isActive: subscription.isActive,
    });

    return NextResponse.json({ success: true, id: subscription.id });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) {
      log.warn("[POST /api/push/subscriptions] Authorization failed");
      return authErr;
    }

    log.error("[POST /api/push/subscriptions]", error);
    return NextResponse.json(
      { message: "Failed to save push subscription" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY");
    const parsed = unsubscribeSchema.safeParse(await request.json());

    if (!parsed.success) {
      log.warn("[DELETE /api/push/subscriptions] Validation failed", {
        userId: user.id,
        role: user.role,
        errors: parsed.error.flatten(),
      });
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const result = await db.$executeRaw`
      UPDATE "pos_push_subscriptions"
      SET "isActive" = false, "updatedAt" = NOW()
      WHERE "endpoint" = ${parsed.data.endpoint}
        AND "userId" = ${user.id}
    `;

    log.info("[DELETE /api/push/subscriptions] Subscription disabled", {
      userId: user.id,
      role: user.role,
      endpoint: describeEndpoint(parsed.data.endpoint),
      updated: result,
    });

    return NextResponse.json({ success: true, disabled: result });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) {
      log.warn("[DELETE /api/push/subscriptions] Authorization failed");
      return authErr;
    }

    log.error("[DELETE /api/push/subscriptions]", error);
    return NextResponse.json(
      { message: "Failed to disable push subscription" },
      { status: 500 },
    );
  }
}

function getSubscriptionFeatures(
  features: Record<string, boolean> | undefined,
  role: string,
) {
  return features && Object.keys(features).length > 0
    ? features
    : defaultFeaturesForRole(role);
}

function defaultFeaturesForRole(role: string) {
  if (role === "OWNER" || role === "ADMIN") {
    return {
      syncFailures: true,
      inventoryRequests: true,
      pendingApprovals: true,
      pendingTransactions: true,
      productionStatus: true,
      whatsapp: true,
      closingDeals: true,
      orders: true,
    };
  }

  if (role === "CASHIER") {
    return {
      syncFailures: true,
      checkoutIssues: true,
      pendingTransactions: true,
      paymentUpdates: true,
      orders: true,
    };
  }

  return {
    customerUpdates: true,
    orderUpdates: true,
    closingDeals: true,
    productionStatus: true,
  };
}

function describeEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return `${url.hostname}...${endpoint.slice(-8)}`;
  } catch {
    return `invalid...${endpoint.slice(-8)}`;
  }
}
