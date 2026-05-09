import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@pos/db";
import { sendPushToSubscriptions } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const closingDealSchema = z.object({
  customerName: z.string().trim().min(1).optional(),
  chatId: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1).optional(),
  amount: z.number().nonnegative().optional(),
  storeId: z.string().trim().min(1).optional(),
  url: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
});

function isAuthorized(request: Request) {
  const secret =
    process.env.CLOSING_DEAL_PUSH_SECRET || process.env.WAHA_WEBHOOK_SECRET;

  if (!secret) return false;

  const bearer = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-webhook-secret");

  return bearer === `Bearer ${secret}` || headerSecret === secret;
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      console.warn("[POST /api/push/closing-deal] Unauthorized request", {
        hasAuthorization: Boolean(request.headers.get("authorization")),
        hasWebhookSecret: Boolean(request.headers.get("x-webhook-secret")),
      });
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const parsed = closingDealSchema.safeParse(await request.json());

    if (!parsed.success) {
      console.warn("[POST /api/push/closing-deal] Validation failed", {
        errors: parsed.error.flatten(),
      });
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const event = parsed.data;
    console.info("[POST /api/push/closing-deal] Request accepted", {
      storeId: event.storeId,
      source: event.source,
      chatId: event.chatId,
      hasCustomerName: Boolean(event.customerName),
      hasMessage: Boolean(event.message),
      hasAmount: event.amount !== undefined,
    });

    const subscriptions = await db.pushSubscription.findMany({
      where: {
        isActive: true,
        role: { in: ["OWNER", "ADMIN", "SALES"] },
        ...(event.storeId ? { storeId: event.storeId } : {}),
      },
    });
    const closingDealSubscriptions = subscriptions.filter(wantsClosingDeals);
    console.info("[POST /api/push/closing-deal] Subscriptions selected", {
      activeCandidates: subscriptions.length,
      closingDealRecipients: closingDealSubscriptions.length,
      filteredOut: subscriptions.length - closingDealSubscriptions.length,
      storeId: event.storeId,
    });

    const customer = event.customerName || event.chatId || "Customer";
    const amount = event.amount ? ` senilai ${formatRupiah(event.amount)}` : "";
    const body = event.message || `${customer} closing deal${amount}.`;

    const result = await sendPushToSubscriptions(closingDealSubscriptions, {
      title: "Closing deal baru",
      body,
      url: event.url || "/wa",
      tag: event.chatId ? `closing-deal:${event.chatId}` : "closing-deal",
    });

    console.info("[POST /api/push/closing-deal] Notification result", {
      recipients: closingDealSubscriptions.length,
      ...result,
    });

    return NextResponse.json({
      success: true,
      recipients: closingDealSubscriptions.length,
      ...result,
    });
  } catch (error) {
    console.error("[POST /api/push/closing-deal]", error);
    return NextResponse.json(
      { message: "Failed to send closing deal notification" },
      { status: 500 },
    );
  }
}

function wantsClosingDeals(subscription: { features: unknown }) {
  if (!subscription.features || typeof subscription.features !== "object") {
    return true;
  }

  const features = subscription.features as Record<string, unknown>;
  return features.closingDeals !== false;
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}
