import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:products:stats");
export const dynamic = "force-dynamic";

type StatsRow = {
  total_products: bigint | number | null;
  low_stock: bigint | number | null;
  negative_stock: bigint | number | null;
  inventory_value: string | number | null;
};

function bigintToNumber(value: bigint | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "bigint" ? Number(value) : value;
}

function decimalStringToNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// GET /api/products/stats?search=&categoryId=
// Returns aggregate stats across the entire (filtered) catalog so the
// UI never reflects only the currently paginated slice.
export async function GET(request: Request) {
  try {
    const user = await requirePermission("product", "read");
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId") || "";
    const storeId = user.storeId || "store-main";

    const conditions: Prisma.Sql[] = [
      Prisma.sql`"storeId" = ${storeId}`,
      Prisma.sql`"isActive" = true`,
    ];

    if (search) {
      const like = `%${search}%`;
      conditions.push(
        Prisma.sql`("name" ILIKE ${like} OR "sku" ILIKE ${like} OR "barcode" ILIKE ${like})`,
      );
    }

    if (categoryId) {
      conditions.push(Prisma.sql`"categoryId" = ${categoryId}`);
    }

    const whereClause = Prisma.join(conditions, " AND ");

    // One round-trip with explicit numeric casts so Postgres doesn't trip
    // over `double precision` (stock) * `numeric` (price). All counts come
    // back as bigint, the SUM as numeric -> stringified `text` so we can
    // safely parse on the JS side without losing precision on huge stores.
    const query = Prisma.sql`
      SELECT
        COUNT(*)::bigint AS total_products,
        COUNT(*) FILTER (WHERE "stock" <= "minStock")::bigint AS low_stock,
        COUNT(*) FILTER (WHERE "stock" < 0)::bigint AS negative_stock,
        COALESCE(SUM("stock"::numeric * "price"::numeric), 0)::text AS inventory_value
      FROM pos_products
      WHERE ${whereClause}
    `;

    const [row] = await db.$queryRaw<StatsRow[]>(query);

    const res = NextResponse.json({
      totalProducts: bigintToNumber(row?.total_products ?? 0),
      lowStock: bigintToNumber(row?.low_stock ?? 0),
      negativeStock: bigintToNumber(row?.negative_stock ?? 0),
      inventoryValue: decimalStringToNumber(row?.inventory_value ?? 0),
    });
    res.headers.set(
      "Cache-Control",
      "private, max-age=10, stale-while-revalidate=30",
    );
    return res;
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch product stats:", error);
    return NextResponse.json(
      { message: "Failed to fetch product stats" },
      { status: 500 },
    );
  }
}
