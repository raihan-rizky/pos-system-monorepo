import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:products:units");
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requirePermission("product", "read");
    const products = await db.product.findMany({
      where: { storeId: user.storeId || "store-main", isActive: true },
      select: { unit: true },
      distinct: ["unit"],
      orderBy: { unit: "asc" },
    });
    const units = [...new Set(products.map(({ unit }) => unit.trim().toLowerCase()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "id"));
    return NextResponse.json({ data: units });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Failed to fetch product units:", error);
    return NextResponse.json({ message: "Daftar satuan belum bisa dimuat." }, { status: 500 });
  }
}
