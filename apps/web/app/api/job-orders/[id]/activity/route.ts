import { db } from "@pos/db";
import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { apiCollection } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:job-orders:id:activity");
export const dynamic = "force-dynamic";

const RETENTION_DAYS = 90;

function retentionCutoff() {
  return new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("production", "read");
    const storeId = user.storeId || "store-main";
    const { id } = await params;

    const activity = await db.productionActivityLog.findMany({
      where: {
        storeId,
        transactionId: id,
        createdAt: { gte: retentionCutoff() },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return apiCollection(activity);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch job order activity:", error);
    return NextResponse.json(
      { message: "Failed to fetch job order activity" },
      { status: 500 },
    );
  }
}
