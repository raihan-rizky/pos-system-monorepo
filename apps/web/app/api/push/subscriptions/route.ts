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

export async function POST(request: Request) {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER", "SALES");
    const body = await request.json();
    const parsed = subscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 },
      );
    }

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

    return NextResponse.json({ success: true, id: subscription.id });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("[POST /api/push/subscriptions]", error);
    return NextResponse.json(
      { message: "Failed to save push subscription" },
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
    productionStatus: true,
  };
}
