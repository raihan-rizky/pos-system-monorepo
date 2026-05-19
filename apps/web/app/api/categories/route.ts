import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { apiCollection } from "@/lib/api/responses";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:categories");
export const dynamic = 'force-dynamic';

// GET /api/categories
export async function GET() {
  try {
    await requirePermission("product", "read");
    const categories = await db.category.findMany({
      orderBy: { order: "asc" },
      include: {
        _count: { select: { products: true } },
      },
    });

    const res = apiCollection(categories);
    res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
    return res;
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch categories:", error);
    return NextResponse.json(
      { message: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}
