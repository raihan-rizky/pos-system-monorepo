import { NextResponse } from "next/server";

import { db } from "@pos/db";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requireRole } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:notifications:id");
const ALL_ROLES = ["OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY"] as const;

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(...ALL_ROLES);
    const { id } = await params;
    const result = await db.notification.updateMany({
      where: { id, userId: user.id },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      return apiError("Notifikasi tidak ditemukan", 404, { code: "NotFound" });
    }

    return NextResponse.json({ data: { id, read: true } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("notifications.read.failed", { error });
    return apiError("Gagal menandai notifikasi", 500, { code: "InternalError" });
  }
}
