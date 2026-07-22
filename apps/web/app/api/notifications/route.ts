import { NextResponse } from "next/server";

import { db } from "@pos/db";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requireRole } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:notifications");
const ALL_ROLES = ["OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY"] as const;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireRole(...ALL_ROLES);
    const requestedLimit = Number(new URL(request.url).searchParams.get("limit") || 20);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(50, Math.max(1, Math.floor(requestedLimit)))
      : 20;

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          eventName: true,
          title: true,
          body: true,
          url: true,
          readAt: true,
          createdAt: true,
        },
      }),
      db.notification.count({
        where: { userId: user.id, readAt: null },
      }),
    ]);

    return NextResponse.json({ data: { notifications, unreadCount } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("notifications.list.failed", { error });
    return apiError("Gagal memuat notifikasi", 500, { code: "InternalError" });
  }
}
