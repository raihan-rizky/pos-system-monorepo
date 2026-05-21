import { NextRequest, NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { apiList, buildPaginationMeta, parsePagination } from "@/lib/api/responses";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:inventory:logs");

const VALID_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);

// GET /api/inventory/logs - Fetch inventory logs with filters
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("product", "read");
    const storeId = user.storeId || "store-main";

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const type = searchParams.get("type"); // IN | OUT | ADJUSTMENT
    const statusParam = searchParams.get("status"); // PENDING,APPROVED,REJECTED (comma-separated)
    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 50,
      maxLimit: 100,
    });
    const days = Number(searchParams.get("days") || "60"); // Default 60-day window

    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: Prisma.InventoryLogWhereInput = {
      product: { storeId },
      createdAt: { gte: since },
    };

    if (productId) where.productId = productId;
    if (type === "IN" || type === "OUT" || type === "ADJUSTMENT") {
      where.type = type;
    }

    const requestedStatuses = (statusParam || "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => VALID_STATUSES.has(s));

    if (requestedStatuses.length > 0) {
      where.status = {
        in: requestedStatuses as Prisma.EnumInventoryLogStatusFilter["in"],
      };
    }

    // Sort PENDING rows first when no explicit status filter is requested,
    // so OWNER's review queue is always above the historical log. Postgres
    // enum sort order matches declaration order: PENDING < APPROVED < REJECTED.
    const orderBy: Prisma.InventoryLogOrderByWithRelationInput[] =
      requestedStatuses.length === 1
        ? [{ createdAt: "desc" }]
        : [{ status: "asc" }, { createdAt: "desc" }];

    const [logs, total, pendingTotal] = await Promise.all([
      db.inventoryLog.findMany({
        where,
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
        orderBy,
        skip,
        take: limit,
      }),
      db.inventoryLog.count({ where }),
      db.inventoryLog.count({
        where: { ...where, status: "PENDING" },
      }),
    ]);

    return apiList(logs, {
      ...buildPaginationMeta(total, page, limit),
      // Extra field surfaced for badge counts. Clients that don't care
      // can ignore it; it doesn't break the ListResponse contract.
      ...({ pendingTotal } as Record<string, number>),
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch inventory logs:", error);
    return NextResponse.json(
      { message: "Failed to fetch inventory logs" },
      { status: 500 },
    );
  }
}
