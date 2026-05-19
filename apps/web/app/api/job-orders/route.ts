import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { apiCollection } from "@/lib/api/responses";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:job-orders");
export const dynamic = 'force-dynamic';

// GET /api/job-orders â€” Fetch all active job orders for the Kanban board
export async function GET() {
  try {
    const user = await requirePermission("production", "read");
    const storeId = user.storeId || "store-main";

    const jobOrders = await db.transaction.findMany({
      where: {
        storeId,
        isJobOrder: true,
        productionStatus: { not: "DELIVERED" },
      },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, imageUrl: true },
            },
          },
        },
        salesperson: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return apiCollection(jobOrders);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch job orders:", error);
    return NextResponse.json(
      { message: "Failed to fetch job orders" },
      { status: 500 }
    );
  }
}
