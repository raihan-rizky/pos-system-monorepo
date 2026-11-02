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
  inventory_unvalued_count: bigint | number | null;
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
    if (!user.storeId) return NextResponse.json({ message: "Toko pengguna belum tersedia.", code: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId") || "";
    const storeId = user.storeId;

    try {
      await db.$executeRaw`SELECT pos_observe_inventory_valuation_v2(${storeId})`;
    } catch (error) {
      log.error("Gagal mencatat pengamatan inventaris", error);
    }

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

    // Match catalog rows first, then value each matched physical stock pool
    // using all of its units. Searching for one unit must not change its HPP.
    const query = Prisma.sql`
      WITH matched AS (
        SELECT * FROM pos_products WHERE ${whereClause}
      ), entity_keys AS (
        SELECT DISTINCT CASE WHEN g.id IS NULL THEN 'product:' || p.id ELSE 'group:' || g.id END AS key
        FROM matched p LEFT JOIN pos_product_stock_groups g
          ON g.id = p."stockGroupId" AND g."storeId" = p."storeId"
      ), valuation AS (
        SELECT * FROM pos_inventory_cost_entities(${storeId}, ARRAY(SELECT key FROM entity_keys))
      )
      SELECT
        (SELECT COUNT(*) FROM matched)::bigint AS total_products,
        (SELECT COUNT(*) FROM matched WHERE "stock" <= "minStock")::bigint AS low_stock,
        (SELECT COUNT(*) FROM matched WHERE "stock" < 0)::bigint AS negative_stock,
        COALESCE(SUM(value), 0)::text AS inventory_value,
        COALESCE(SUM(unvalued_count), 0)::bigint AS inventory_unvalued_count
      FROM valuation
    `;

    const [row] = await db.$queryRaw<StatsRow[]>(query);

    const res = NextResponse.json({
      totalProducts: bigintToNumber(row?.total_products ?? 0),
      lowStock: bigintToNumber(row?.low_stock ?? 0),
      negativeStock: bigintToNumber(row?.negative_stock ?? 0),
      inventoryValue: decimalStringToNumber(row?.inventory_value ?? 0),
      inventoryUnvaluedCount: bigintToNumber(row?.inventory_unvalued_count ?? 0),
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
      { message: "Statistik produk belum berhasil dimuat." },
      { status: 500 },
    );
  }
}
