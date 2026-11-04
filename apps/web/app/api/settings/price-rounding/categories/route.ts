import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { AuthError, handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:settings:price-rounding:categories");
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    try {
      await requirePermission("settings.price_rounding", "read");
    } catch (error) {
      if (!(error instanceof AuthError) || error.statusCode !== 403) throw error;
      await requirePermission("settings.price_rounding", "update");
    }
    const categories = await db.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
    return NextResponse.json(categories, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Failed to fetch rounding categories:", error);
    return NextResponse.json({ message: "Kategori belum dapat dimuat." }, { status: 500 });
  }
}
