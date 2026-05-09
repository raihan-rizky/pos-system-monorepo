import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@pos/db";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

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
    const user = await requireRole("OWNER", "ADMIN", "CASHIER", "SALES");
    const body = await request.json();
    const parsed = subscriptionSchema.safeParse(body);

    if (!parsed.success) {
      console.warn("[POST /api/push/subscriptions] Validation failed", {
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
    console.info("[POST /api/push/subscriptions] Saving subscription", {
      userId: user.id,
      role: user.role,
      storeId: user.storeId,
      endpoint: endpointDescription,
      hasAuth: Boolean(parsed.data.keys?.auth),
      hasP256dh: Boolean(parsed.data.keys?.p256dh),
      featureKeys: parsed.data.features ? Object.keys(parsed.data.features) : [],
    });

    const subscription = await db.pushSubscription.upsert({
      where: { endpoint: parsed.data.endpoint },
      update: {
        userId: user.id,
        role: user.role,
        storeId: user.storeId || null,
        auth: parsed.data.keys?.auth || null,
        p256dh: parsed.data.keys?.p256dh || null,
        features: parsed.data.features || defaultFeaturesForRole(user.role),
        isActive: true,
      },
      create: {
        endpoint: parsed.data.endpoint,
        userId: user.id,
        role: user.role,
        storeId: user.storeId || null,
        auth: parsed.data.keys?.auth || null,
        p256dh: parsed.data.keys?.p256dh || null,
        features: parsed.data.features || defaultFeaturesForRole(user.role),
      },
    });

    console.info("[POST /api/push/subscriptions] Subscription saved", {
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
      console.warn("[POST /api/push/subscriptions] Authorization failed");
      return authErr;
    }

    console.error("[POST /api/push/subscriptions]", error);
    return NextResponse.json(
      { message: "Failed to save push subscription" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER", "SALES");
    const parsed = unsubscribeSchema.safeParse(await request.json());

    if (!parsed.success) {
      console.warn("[DELETE /api/push/subscriptions] Validation failed", {
        userId: user.id,
        role: user.role,
        errors: parsed.error.flatten(),
      });
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const result = await db.pushSubscription.updateMany({
      where: {
        endpoint: parsed.data.endpoint,
        userId: user.id,
      },
      data: {
        isActive: false,
      },
    });

    console.info("[DELETE /api/push/subscriptions] Subscription disabled", {
      userId: user.id,
      role: user.role,
      endpoint: describeEndpoint(parsed.data.endpoint),
      updated: result.count,
    });

    return NextResponse.json({ success: true, disabled: result.count });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) {
      console.warn("[DELETE /api/push/subscriptions] Authorization failed");
      return authErr;
    }

    console.error("[DELETE /api/push/subscriptions]", error);
    return NextResponse.json(
      { message: "Failed to disable push subscription" },
      { status: 500 },
    );
  }
}

function defaultFeaturesForRole(role: string) {
  if (role === "OWNER" || role === "ADMIN") {
    return {
      syncFailures: true,
      pendingApprovals: true,
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
