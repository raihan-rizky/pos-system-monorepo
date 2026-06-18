import { db } from "@pos/db";
import { requirePermission } from "@/lib/rbac/guard";
import { buildPaginationMeta } from "@/lib/api/responses";
import type { POSInitialData } from "./POSClientPage";
import { withCalculatedStock } from "@/features/product-stock-groups/stock-display";

const POS_PAGE_SIZE = 24;

export async function loadPOSInitialData(): Promise<POSInitialData> {
  try {
    if (process.env.E2E_AUTH_BYPASS === "1") {
      return {
        products: null,
        categories: [],
      };
    }

    const user = await requirePermission("product", "read");
    const storeId = user.storeId || "store-main";

    const where = {
      storeId,
      isActive: true,
    };

    const [products, total, categories] = await Promise.all([
      db.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          sku: true,
          price: true,
          costPrice: true,
          hargaDinas: true,
          stock: true,
          minStock: true,
          unit: true,
          size: true,
          material: true,
          imageUrl: true,
          isActive: true,
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
    ]);

    return {
      products: {
        data: products.map((product) => ({
          ...withCalculatedStock({
            ...product,
            price: Number(product.price),
            costPrice: product.costPrice == null ? null : Number(product.costPrice),
            hargaDinas: product.hargaDinas == null ? null : Number(product.hargaDinas),
            stock: Number(product.stock),
          }),
          stockGroup: product.stockGroup
            ? {
                ...product.stockGroup,
                baseStock: Number(product.stockGroup.baseStock),
              }
            : null,
        })),
        pagination: buildPaginationMeta(total, 1, POS_PAGE_SIZE),
      },
      categories,
    };
  } catch {
    return {
      products: null,
      categories: [],
    };
  }
}
