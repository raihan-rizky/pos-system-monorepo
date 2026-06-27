import { NextResponse } from "next/server";
import { db } from "@pos/db";

import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";

const logger = getLogger("api:inventory:bulk:detail");

export async function GET(
  _request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    await requirePermission("inventory", "read");
    const { batchId } = await context.params;
    const batch = await db.batchOperation.findUnique({
      where: { id: batchId },
      include: {
        creator: { select: { id: true, name: true, role: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, stock: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (
      !batch ||
      !["BULK_STOCK_ADJUSTMENT", "BULK_STOCK_GROUP_ADJUSTMENT", "DAILY_STOCK_MATCHING"].includes(
        batch.type,
      )
    ) {
      return apiError("Batch not found", 404, { code: "NotFound" });
    }

    const inventoryLogIds = batch.items
      .map((item) => item.inventoryLogId)
      .filter((id): id is string => Boolean(id));
    const logs = inventoryLogIds.length
      ? await db.inventoryLog.findMany({
          where: { id: { in: inventoryLogIds } },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                unit: true,
                stock: true,
                imageUrl: true,
                category: { select: { name: true, icon: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];
    const logById = new Map(logs.map((log) => [log.id, log]));

    return NextResponse.json({
      ...batch,
      items: batch.items.map((item) => ({
        ...item,
        inventoryLog: item.inventoryLogId ? logById.get(item.inventoryLogId) ?? null : null,
      })),
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    logger.error("inventory.bulk.detail.failed", { error });
    return apiError("Failed to load bulk inventory request", 500, { code: "InternalError" });
  }
}
