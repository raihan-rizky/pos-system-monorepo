import { db } from "@pos/db";
import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { apiCollection } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:job-orders:activity");
export const dynamic = "force-dynamic";

const RETENTION_DAYS = 90;

function retentionCutoff() {
  return new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function parseLimit(request: Request) {
  const url = new URL(request.url);
  const raw = parseInt(url.searchParams.get("limit") || "20", 10);
  return Math.max(1, Math.min(50, raw || 20));
}

export async function GET(request: Request) {
  try {
    const user = await requirePermission("production", "read");
    const storeId = user.storeId || "store-main";
    const limit = parseLimit(request);

    const activity = await db.productionActivityLog.findMany({
      where: {
        storeId,
        createdAt: { gte: retentionCutoff() },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return apiCollection(activity);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch production activity:", error);
    return NextResponse.json(
      { message: "Failed to fetch production activity" },
      { status: 500 },
    );
  }
}
