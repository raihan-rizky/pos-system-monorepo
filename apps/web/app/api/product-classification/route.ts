import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { listCatalogSubcategories } from "@/features/product-classification/helpers/classification";

export const dynamic = "force-dynamic";
const log = getLogger("api:product-classification");

export async function GET() {
  try {
    await requirePermission("product", "read");
    const [subcategories, legacyCategories] = await Promise.all([
      db.productSubcategory.findMany({
        select: { id: true, group: true, name: true, legacyCategoryId: true },
        orderBy: [{ group: "asc" }, { name: "asc" }, { id: "asc" }],
      }),
      db.category.findMany({ select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    ]);
    return NextResponse.json({
      subcategories: [...listCatalogSubcategories("ATK", subcategories), ...listCatalogSubcategories("PERCETAKAN", subcategories)],
      legacyCategories,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Gagal memuat klasifikasi produk.");
    return NextResponse.json({ message: "Kategori belum dapat dimuat. Silakan coba lagi." }, { status: 500 });
  }
}
