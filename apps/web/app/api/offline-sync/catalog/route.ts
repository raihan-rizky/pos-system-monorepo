import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { loadProductBaseCosts } from "@/features/customer-category-pricing/helpers/base-cost";
import { withCalculatedStock } from "@/features/product-stock-groups/stock-display";
import { groupProductsByNameAndCategory } from "@/features/pos-search/services/product-grouping-service";
import { getLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";
const log = getLogger("api:offline-sync:catalog");
const MAX_PRODUCTS = 5000;

export async function GET() {
  try {
    const user = await requirePermission("product", "read");
    const storeId = user.storeId || "store-main";
    const snapshot = await db.$transaction(async (tx) => {
      const where = { storeId, isActive: true };
      const count = await tx.product.count({ where });
      if (count > MAX_PRODUCTS) return null;
      const [products, categories] = await Promise.all([
        tx.product.findMany({
          where,
          include: {
            category: { select: { id: true, name: true, icon: true, color: true } },
            brand: { select: { id: true, name: true, normalizedName: true } },
            stockGroup: { select: { id: true, displayName: true, baseUnit: true, baseStock: true } },
          },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        }),
        tx.category.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { products: { where: { storeId } } } } } }),
      ]);
      const baseCosts = await loadProductBaseCosts(tx, products);
      const normalized = products.map((product) => ({
        ...withCalculatedStock({
          ...product,
          price: Number(product.price),
          costPrice: product.costPrice === null ? null : Number(product.costPrice),
          hargaDinas: product.hargaDinas === null ? null : Number(product.hargaDinas),
          hargaAgen: product.hargaAgen === null ? null : Number(product.hargaAgen),
          stockGroup: product.stockGroup ? { ...product.stockGroup, baseStock: Number(product.stockGroup.baseStock) } : null,
        }),
        ...baseCosts.get(product.id),
      }));
      return { products: groupProductsByNameAndCategory(normalized), categories };
    }, { isolationLevel: "RepeatableRead", timeout: 30_000 });

    if (!snapshot) {
      return NextResponse.json({ message: `Katalog terlalu besar untuk disiapkan di perangkat ini (maksimal ${MAX_PRODUCTS} produk).` }, { status: 422 });
    }
    return NextResponse.json({ ...snapshot, cashierId: user.id, storeId, generatedAt: new Date().toISOString() }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Gagal menyiapkan katalog offline", error);
    return NextResponse.json({ message: "Katalog belum dapat disiapkan. Coba lagi saat koneksi stabil." }, { status: 500 });
  }
}
