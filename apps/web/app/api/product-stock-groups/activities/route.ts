import { db } from "@pos/db";
import { z } from "zod";

import {
  apiError,
  apiList,
  apiValidationError,
  buildPaginationMeta,
} from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const log = getLogger("api:product-stock-groups:activities");

const activitiesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional().nullable(),
  type: z.string().trim().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const user = await requirePermission("product", "read");
    const storeId = user.storeId || "store-main";
    const { searchParams } = new URL(request.url);
    const query = activitiesQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      type: searchParams.get("type") ?? undefined,
    });
    const search = query.search?.trim();
    const where = {
      stockGroup: { storeId },
      type: query.type || { not: "CONVERSION_RATE_CHANGED" },
      ...(search
        ? {
            OR: [
              { note: { contains: search, mode: "insensitive" as const } },
              {
                stockGroup: {
                  displayName: { contains: search, mode: "insensitive" as const },
                },
              },
              {
                product: {
                  name: { contains: search, mode: "insensitive" as const },
                },
              },
              {
                product: {
                  sku: { contains: search, mode: "insensitive" as const },
                },
              },
              {
                product: {
                  unit: { contains: search, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;

    const [total, rows] = await Promise.all([
      db.productStockGroupActivity.count({ where }),
      db.productStockGroupActivity.findMany({
        where,
        include: {
          stockGroup: { select: { id: true, displayName: true } },
          product: { select: { id: true, name: true, sku: true, unit: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
      }),
    ]);

    return apiList(rows, buildPaginationMeta(total, query.page, query.limit));
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) return apiValidationError(error);

    log.error("Failed to fetch stock group activities", error);
    return apiError("Failed to fetch stock group activities", 500, {
      code: "InternalError",
    });
  }
}
