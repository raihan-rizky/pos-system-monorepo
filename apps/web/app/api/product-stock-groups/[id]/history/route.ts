import { db } from "@pos/db";
import { z } from "zod";

import {
  apiError,
  apiList,
  apiValidationError,
  buildPaginationMeta,
} from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:product-stock-groups:history");

const historyQuerySchema = z.object({
  tab: z.enum(["activity", "conversion"]).default("activity"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("product", "read");
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const query = historyQuerySchema.parse({
      tab: searchParams.get("tab") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    const where = {
      stockGroupId: id,
      ...(query.tab === "conversion"
        ? { type: "CONVERSION_RATE_CHANGED" }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const dbWithActivity = db as typeof db & {
      productStockGroupActivity: {
        findMany: (args: unknown) => Promise<unknown[]>;
        count: (args: unknown) => Promise<number>;
      };
    };

    const [total, rows] = await Promise.all([
      dbWithActivity.productStockGroupActivity.count({ where }),
      dbWithActivity.productStockGroupActivity.findMany({
        where,
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

    log.error("Failed to fetch stock group history", error);
    return apiError("Failed to fetch stock group history", 500, {
      code: "InternalError",
    });
  }
}
