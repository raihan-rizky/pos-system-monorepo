import { loadProductBaseCosts } from "@/features/customer-category-pricing/helpers/base-cost";
import { groupProductsByNameAndCategory } from "@/features/pos-search/services/product-grouping-service";
import { db } from "@pos/db";
import { requirePermission } from "@/lib/rbac/guard";
import { buildPaginationMeta } from "@/lib/api/responses";
import type { POSInitialData } from "./POSClientPage";
import { withCalculatedStock } from "@/features/product-stock-groups/stock-display";

const POS_PAGE_SIZE = 24;

export async function loadPOSInitialData(): Promise<POSInitialData> {
  try {
    if (process.env.NODE_ENV !== "production" && process.env.E2E_AUTH_BYPASS === "1") {
      return {
        products: null,
        categories: [],
        shiftEnabled: true,
      };
    }

    const user = await requirePermission("product", "read");
    const storeId = user.storeId || "store-main";

    const where = {
      storeId,
      isActive: true,
    };

    const productsUpdatedAt = Date.now();
    const [products, total, categories, storeSettings] = await Promise.all([
      db.product.findMany({
        where,
        select: {
          id: true,
          storeId: true,
          name: true,
          description: true,
          sku: true,
          barcode: true,
          price: true,
          costPrice: true,
          hargaDinas: true,
          hargaAgen: true,
          stock: true,
          minStock: true,
          unit: true,
          size: true,
          material: true,
          imageUrl: true,
          isActive: true,
          brandId: true,
          stockGroupId: true,
          unitMultiplierToBase: true,
          conversionNeedsReview: true,
          stockGroup: {
            select: {
              id: true,
              displayName: true,
              baseUnit: true,
              baseStock: true,
            },
          },
          category: {
            select: { id: true, name: true, icon: true, color: true },
          },
          brand: {
            select: { id: true, name: true, normalizedName: true },
          },
        },
        orderBy: { name: "asc" },
        take: POS_PAGE_SIZE,
      }),
      db.product.count({ where }),
      db.category.findMany({
        orderBy: { order: "asc" },
        include: {
          _count: { select: { products: true } },
        },
      }),
      db.storeSettings.findUnique({
        where: { id: "store-main" },
        select: { shiftEnabled: true },
      }),
    ]);

    const baseCosts = await loadProductBaseCosts(db, products);
    const catalogProducts = products.map((product) => ({
      ...baseCosts.get(product.id),
      ...withCalculatedStock({
        ...product,
        price: Number(product.price),
        costPrice: product.costPrice == null ? null : Number(product.costPrice),
        hargaDinas: product.hargaDinas == null ? null : Number(product.hargaDinas),
        hargaAgen: product.hargaAgen == null ? null : Number(product.hargaAgen),
        stock: Number(product.stock),
      }),
      stockGroup: product.stockGroup
        ? {
            ...product.stockGroup,
            baseStock: Number(product.stockGroup.baseStock),
          }
        : null,
    }));

    return {
      products: {
        data: groupProductsByNameAndCategory(catalogProducts),
        pagination: buildPaginationMeta(total, 1, POS_PAGE_SIZE),
      },
      productsUpdatedAt,
      categories,
      shiftEnabled: storeSettings?.shiftEnabled ?? true,
    };
  } catch {
    return {
      products: null,
      categories: [],
      shiftEnabled: true,
    };
  }
}
