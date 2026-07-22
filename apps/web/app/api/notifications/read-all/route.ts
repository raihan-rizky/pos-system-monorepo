import { NextResponse } from "next/server";

import { db } from "@pos/db";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requireRole } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:notifications:read-all");
const ALL_ROLES = ["OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY"] as const;

export async function POST() {
  try {
    const user = await requireRole(...ALL_ROLES);
    const result = await db.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ data: { updated: result.count } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("notifications.read_all.failed", { error });
    return apiError("Gagal menandai semua notifikasi", 500, {
      code: "InternalError",
    });
  }
}
