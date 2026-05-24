import { NextResponse } from "next/server";
import { db } from "@pos/db";
import type { Role } from "@pos/db";
import { apiError } from "@/lib/api/responses";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import {
  isWaConfigured,
  normalizeWahaChatId,
  sendWaTextMessage,
} from "@/lib/whatsapp";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:job-orders:id:pickup-notifications");
export const dynamic = "force-dynamic";

function maskChatId(chatId: string) {
  const phone = chatId.split("@")[0] ?? "";
  if (phone.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, phone.length - 4))}${phone.slice(-4)}`;
}

function buildPickupReadyMessage({
  customerName,
  invoiceNumber,
}: {
  customerName: string;
  invoiceNumber: string;
}) {
  return `Halo ${customerName}, pesanan Anda dengan invoice ${invoiceNumber} sudah siap diambil. Terima kasih.`;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("production", "update");
    const storeId = user.storeId || "store-main";
    const { id } = await params;

    if (!isWaConfigured()) {
      return apiError(
        "WAHA is not configured",
        503,
        { code: "ServiceUnavailable" },
      );
    }

    const jobOrder = await db.transaction.findFirst({
      where: { id, storeId, isJobOrder: true },
      select: {
        id: true,
        invoiceNumber: true,
        customerName: true,
        productionStatus: true,
        customer: {
          select: {
            phone: true,
          },
        },
      },
    });

    if (!jobOrder) {
      return apiError("Job order not found", 404, { code: "NotFound" });
    }

    if (jobOrder.productionStatus !== "READY_PICKUP") {
      return apiError(
        "Pickup notifications can only be sent for ready jobs",
        409,
        { code: "Conflict" },
      );
    }

    const phone = jobOrder.customer?.phone;
    if (!phone) {
      return apiError(
        "No WhatsApp number is saved for this customer",
        422,
        {
          code: "ValidationError",
          errors: { phone: ["No WhatsApp number"] },
        },
      );
    }

    const chatId = normalizeWahaChatId(phone);
    if (!chatId) {
      return apiError(
        "Customer WhatsApp number is invalid",
        422,
        {
          code: "ValidationError",
          errors: { phone: ["Invalid WhatsApp number"] },
        },
      );
    }

    const customerName = jobOrder.customerName || "Pelanggan";
    const invoiceNumber = jobOrder.invoiceNumber || "job order";
    const message = buildPickupReadyMessage({ customerName, invoiceNumber });

    try {
      await sendWaTextMessage(chatId, message);
    } catch (error) {
      log.error("Failed to send pickup WhatsApp notification:", error);
      return apiError(
        "Failed to send WhatsApp pickup notification",
        502,
        { code: "BadGateway" },
      );
    }

    const activity = await db.productionActivityLog.create({
      data: {
        transactionId: jobOrder.id,
        storeId,
        invoiceNumber: jobOrder.invoiceNumber,
        customerName: jobOrder.customerName,
        fromStatus: "READY_PICKUP",
        toStatus: "READY_PICKUP",
        actorId: user.id,
        actorName: user.name || user.username,
        actorRole: user.role as Role,
        eventType: "PICKUP_WHATSAPP_SENT",
        note: "Notifikasi WhatsApp pickup terkirim",
      },
    });

    return NextResponse.json(
      {
        data: {
          id: activity.id,
          jobOrderId: jobOrder.id,
          channel: "WHATSAPP",
          eventType: activity.eventType,
          recipient: maskChatId(chatId),
          message,
          createdAt: activity.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to create pickup notification:", error);
    return apiError("Failed to create pickup notification", 500, {
      code: "InternalError",
    });
  }
}
