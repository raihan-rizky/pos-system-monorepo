import { NextResponse } from "next/server";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { listClassificationProducts } from "@/features/product-classification/server/classification-products";
import type { CatalogGroup } from "@/features/product-classification/types";

export const dynamic = "force-dynamic";
const log = getLogger("api:product-classification:products");

export async function GET(request: Request) {
  try {
    const user = await requirePermission("product", "read");
    const params = new URL(request.url).searchParams;
    const group = params.get("group") || undefined;
    const status = params.get("status") || undefined;
    if ((group && group !== "ATK" && group !== "PERCETAKAN") ||
      (status && status !== "all" && status !== "classified" && status !== "unclassified")) {
      return NextResponse.json({ message: "Filter kategori belum sesuai." }, { status: 422 });
    }
    const result = await listClassificationProducts(user.storeId || "store-main", {
      search: params.get("search") || undefined,
      legacyCategoryId: params.get("legacyCategoryId") || undefined,
      group: group as CatalogGroup | undefined,
      status: status as "all" | "classified" | "unclassified" | undefined,
      subcategoryId: params.get("subcategoryId") || undefined,
      page: Number(params.get("page") || 1),
      limit: Number(params.get("limit") || 25),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Gagal memuat satuan produk untuk klasifikasi.");
    return NextResponse.json({ message: "Produk belum dapat dimuat. Silakan coba lagi." }, { status: 500 });
  }
}
