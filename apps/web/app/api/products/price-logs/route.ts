import { NextRequest, NextResponse } from "next/server";
import {
  db,
  Prisma,
  ProductPriceLogField,
  ProductPriceLogSource,
} from "@pos/db";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";
import { apiList, buildPaginationMeta, parsePagination } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:products:price-logs");
const VALID_FIELDS = new Set(["PRICE", "COST_PRICE"]);
const VALID_SOURCES = new Set(["MANUAL", "IMPORT", "API", "SYSTEM"]);

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole("OWNER", "ADMIN");
    const storeId = user.storeId || "store-main";
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 50,
      maxLimit: 100,
    });

    const productId = searchParams.get("productId") || undefined;
    const field = searchParams.get("field") || undefined;
    const source = searchParams.get("source") || undefined;
    const from = parseDateBoundary(searchParams.get("from"), "start");
    const to = parseDateBoundary(searchParams.get("to"), "end");
    const createdAt =
      from || to
        ? {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          }
        : undefined;

    const where: Prisma.ProductPriceLogWhereInput = {
      storeId,
      ...(productId ? { productId } : {}),
      ...(field && VALID_FIELDS.has(field)
        ? { field: field as ProductPriceLogField }
        : {}),
      ...(source && VALID_SOURCES.has(source)
        ? { source: source as ProductPriceLogSource }
        : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const [logs, total] = await Promise.all([
      db.productPriceLog.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              category: { select: { name: true, icon: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.productPriceLog.count({ where }),
    ]);

    return apiList(logs, buildPaginationMeta(total, page, limit));
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch product price logs:", error);
    return NextResponse.json(
      { message: "Failed to fetch product price logs" },
      { status: 500 },
    );
  }
}

function parseDateBoundary(
  value: string | null,
  boundary: "start" | "end",
): Date | null {
  if (!value) return null;
  const suffix =
    boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  const parsed = new Date(`${value.slice(0, 10)}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
