import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import {
  parseSearchQuery,
  buildProductSearchOR,
} from "@/features/pos-search/pos-search";
import {
  buildProductStockFilter,
  buildProductStockStatusFilter,
  type ProductStockStatusFilter,
} from "@/features/pos-search/pos-stock-filter";
import { apiList, buildPaginationMeta, parsePagination } from "@/lib/api/responses";
import { buildProductPriceLogEntries } from "@/lib/product-price-logs/price-log-entries";
import { withCalculatedStock } from "@/features/product-stock-groups/stock-display";
import {
  buildStockGroupCreateData,
  ensureProductStockGroup,
  shouldMarkConversionForReview,
} from "@/features/product-stock-groups/product-stock-groups-service";
import { normalizeStockGroupKey } from "@/features/product-stock-groups/stock-grouping";
import { groupProductsByNameAndCategory } from "@/features/pos-search/services/product-grouping-service";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:products");
const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  barcode: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "Price must be >= 0"),
  costPrice: z.coerce.number().optional().nullable(),
  hargaDinas: z.coerce.number().min(0, "Harga Dinas must be >= 0").optional().nullable(),
  hargaAgen: z.coerce.number().min(0, "Harga Agen must be >= 0").optional().nullable(),
  stock: z.coerce.number().default(0),
  unitMultiplierToBase: z.coerce.number().positive().optional(),
  minStock: z.coerce.number().default(5),
  unit: z.string().default("pcs"),
  size: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  categoryId: z.string().min(1, "Category is required"),
  brandId: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  smallestUnitVariant: z.object({
    unit: z.string().trim().min(1),
    sku: z.string().trim().min(1),
    barcode: z.string().optional().nullable(),
    price: z.coerce.number().min(0),
    costPrice: z.coerce.number().optional().nullable(),
    multiplierFromPackaging: z.coerce.number().positive(),
  }).optional(),
}).superRefine((value, ctx) => {
  if (
    value.smallestUnitVariant &&
    value.smallestUnitVariant.unit.trim().toLowerCase() ===
      value.unit.trim().toLowerCase()
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["smallestUnitVariant", "unit"],
      message: "Smallest unit must be different from packaging unit",
    });
  }
});

export const dynamic = 'force-dynamic';

async function brandBelongsToStore(brandId: string | null | undefined, storeId: string) {
  if (!brandId) return true;
  const brand = await db.brand.findFirst({
    where: { id: brandId, storeId },
    select: { id: true },
  });
  return Boolean(brand);
}

// GET /api/products?search=xxx&categoryId=xxx&limit=100
export async function GET(request: Request) {
  try {
    const user = await requirePermission("product", "read");
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId") || "";
    const storeId = user.storeId || "store-main";
    // Cap at 200 to prevent unbounded result sets on Vercel
    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 100,
      maxLimit: 200,
    });
    const inStockOnly = searchParams.get("inStockOnly") === "true";
    const stockStatus = searchParams.get("stockStatus") as ProductStockStatusFilter | null;
    const stockGroupMinVariants =
      Number(searchParams.get("stockGroupMinVariants") ?? "0") || 0;

    const tokens = parseSearchQuery(search);
    const searchWhere = buildProductSearchOR(tokens);
    const stockFilter =
      buildProductStockStatusFilter(stockStatus) ??
      buildProductStockFilter(inStockOnly);

    let stockGroupFilter: Prisma.ProductWhereInput = {};
    if (stockGroupMinVariants > 0) {
      const groups = await db.productStockGroup.findMany({
        where: {
          storeId,
          ...(categoryId
            ? { products: { some: { isActive: true, categoryId } } }
            : {}),
        },
        include: {
          products: {
            where: { isActive: true },
            select: { id: true },
          },
        },
      });
      stockGroupFilter = {
        stockGroupId: {
          in: groups
            .filter((group) => {
              const variantCount =
                "products" in group && Array.isArray(group.products)
                  ? group.products.length
                  : (group as { _count?: { products?: number } })._count
                      ?.products ?? 0;
              return variantCount >= stockGroupMinVariants;
            })
            .map((group) => group.id),
        },
      };
    }

    const whereClause: Prisma.ProductWhereInput = {
      storeId,
      isActive: true,
      ...(searchWhere ?? {}),
      ...(categoryId && { categoryId }),
      ...(stockFilter ?? {}),
      ...(stockGroupFilter ?? {}),
    };

    const [products, total] = await Promise.all([
      db.product.findMany({
        where: whereClause,
        include: {
          category: {
            select: { id: true, name: true, icon: true, color: true },
          },
          brand: {
            select: { id: true, name: true, normalizedName: true },
          },
          stockGroup: {
            select: {
              id: true,
              groupKey: true,
              displayName: true,
              baseUnit: true,
              baseStock: true,
            },
          },
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      db.product.count({
        where: whereClause,
      }),
    ]);

    const rawProducts = products.map((product) => withCalculatedStock(product));
    const groupedProducts = groupProductsByNameAndCategory(rawProducts as any);

    const res = apiList(
      groupedProducts,
      buildPaginationMeta(total, page, limit),
    );
    res.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30");
    return res;
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch products:", error);
    return NextResponse.json(
      { message: "Failed to fetch products" },
      { status: 500 }
    );
  }
}


// POST /api/products - Create a new product
export async function POST(request: Request) {
  try {
    const user = await requirePermission("product", "create");
    const body = await request.json();
    
    // Validate request body
    const validatedData = productSchema.parse(body);

    // Check for duplicate SKU
    const existingProduct = await db.product.findUnique({
      where: { sku: validatedData.sku },
    });

    if (existingProduct) {
      return NextResponse.json(
        { message: "SKU already exists. Please use a unique SKU." },
        { status: 409 }
      );
    }

    if (validatedData.smallestUnitVariant) {
      const existingSmallestSku = await db.product.findUnique({
        where: { sku: validatedData.smallestUnitVariant.sku },
      });
      if (existingSmallestSku) {
        return NextResponse.json(
          { message: "Smallest unit SKU already exists. Please use a unique SKU." },
          { status: 409 }
        );
      }
    }

    const storeId = user.storeId || "store-main";
    const unitMultiplierProvided = body.unitMultiplierToBase !== undefined && body.unitMultiplierToBase !== null;

    if (!(await brandBelongsToStore(validatedData.brandId, storeId))) {
      return NextResponse.json(
        { message: "Merek tidak ditemukan" },
        { status: 404 },
      );
    }

    const product = await db.$transaction(async (tx) => {
      if (validatedData.smallestUnitVariant) {
        const smallest = validatedData.smallestUnitVariant;
        const multiplier = smallest.multiplierFromPackaging;
        const groupKey = normalizeStockGroupKey({
          name: validatedData.name,
          categoryId: validatedData.categoryId,
          material: validatedData.material,
          size: validatedData.size,
        });
        const existingGroup = await tx.productStockGroup.findUnique({
          where: { storeId_groupKey: { storeId, groupKey } },
          include: {
            products: {
              where: { isActive: true },
              select: { id: true, unit: true },
            },
          },
        });
        if (existingGroup) throw new Error("STOCK_GROUP_ALREADY_EXISTS");

        const baseStock = Number(validatedData.stock ?? 0) * multiplier;
        const { group } = await ensureProductStockGroup(tx, {
          storeId,
          name: validatedData.name,
          categoryId: validatedData.categoryId,
          material: validatedData.material,
          size: validatedData.size,
          displayName: validatedData.name,
          baseUnit: smallest.unit,
          baseStock,
        });
        const { smallestUnitVariant: _smallestUnitVariant, ...packagingData } =
          validatedData;

        const packaging = await tx.product.create({
          data: {
            ...packagingData,
            unitMultiplierToBase: multiplier,
            stockGroupId: group.id,
            conversionNeedsReview: false,
            storeId,
          },
          include: {
            category: {
              select: { id: true, name: true, icon: true, color: true },
            },
            brand: {
              select: { id: true, name: true, normalizedName: true },
            },
            stockGroup: {
              select: {
                id: true,
                groupKey: true,
                displayName: true,
                baseUnit: true,
                baseStock: true,
              },
            },
          },
        });

        const smallestProduct = await tx.product.create({
          data: {
            name: validatedData.name,
            sku: smallest.sku,
            barcode: smallest.barcode,
            description: validatedData.description,
            price: smallest.price,
            costPrice: smallest.costPrice ?? null,
            stock: baseStock,
            minStock: validatedData.minStock,
            unit: smallest.unit,
            size: validatedData.size,
            material: validatedData.material,
            categoryId: validatedData.categoryId,
            brandId: validatedData.brandId ?? null,
            imageUrl: validatedData.imageUrl,
            stockGroupId: group.id,
            unitMultiplierToBase: 1,
            conversionNeedsReview: false,
            storeId,
          },
        });

        const priceLogEntries = [
          ...buildProductPriceLogEntries({
            productId: packaging.id,
            storeId,
            before: null,
            after: {
              price: packaging.price,
              costPrice: packaging.costPrice,
            },
            actor: user,
            source: "MANUAL",
          }),
          ...buildProductPriceLogEntries({
            productId: smallestProduct.id,
            storeId,
            before: null,
            after: {
            price: smallestProduct.price,
            costPrice: smallestProduct.costPrice,
            },
            actor: user,
            source: "MANUAL",
            note: `Smallest unit variant for ${validatedData.name}`,
          }),
        ];

        if (priceLogEntries.length > 0) {
          await tx.productPriceLog.createMany({ data: priceLogEntries });
        }

        const txWithActivity = tx as typeof tx & {
          productStockGroupActivity?: {
            create: (args: unknown) => Promise<unknown>;
          };
        };
        await txWithActivity.productStockGroupActivity?.create({
          data: {
            stockGroupId: group.id,
            type: "PAIRED_VARIANTS_CREATED",
            productId: packaging.id,
            note: `Created ${validatedData.unit} and ${smallest.unit} variants`,
            createdBy: user.id,
            person: user.name ?? null,
            before: null,
            after: {
              baseUnit: smallest.unit,
              baseStock,
              variants: [
                {
                  id: packaging.id,
                  unit: validatedData.unit,
                  unitMultiplierToBase: multiplier,
                },
                {
                  id: smallestProduct.id,
                  unit: smallest.unit,
                  unitMultiplierToBase: 1,
                },
              ],
            },
          },
        });

        return packaging;
      }

      const { multiplier, baseStock } = buildStockGroupCreateData({
        unitMultiplierToBase: validatedData.unitMultiplierToBase,
        stock: validatedData.stock,
      });
      const { group, created: groupCreated } = await ensureProductStockGroup(tx, {
        storeId,
        name: validatedData.name,
        categoryId: validatedData.categoryId,
        material: validatedData.material,
        size: validatedData.size,
        displayName: validatedData.name,
        baseUnit: validatedData.unit,
        baseStock,
      });
      const created = await tx.product.create({
        data: {
          ...validatedData,
          unitMultiplierToBase: multiplier,
          stockGroupId: group.id,
          conversionNeedsReview: shouldMarkConversionForReview({
            groupCreated,
            unitMultiplierProvided,
            unit: validatedData.unit,
            baseUnit: group.baseUnit,
          }),
          storeId,
        },
        include: {
          category: {
            select: { id: true, name: true, icon: true, color: true },
          },
          brand: {
            select: { id: true, name: true, normalizedName: true },
          },
          stockGroup: {
            select: {
              id: true,
              groupKey: true,
              displayName: true,
              baseUnit: true,
              baseStock: true,
            },
          },
        },
      });

      const priceLogEntries = buildProductPriceLogEntries({
        productId: created.id,
        storeId,
        before: null,
        after: {
          price: created.price,
          costPrice: created.costPrice,
        },
        actor: user,
        source: "MANUAL",
      });

      if (priceLogEntries.length > 0) {
        await tx.productPriceLog.createMany({ data: priceLogEntries });
      }

      return created;
    });

    return NextResponse.json(withCalculatedStock(product), { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to create product:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    if (error instanceof Error && error.message === "STOCK_GROUP_ALREADY_EXISTS") {
      return NextResponse.json(
        {
          message:
            "A matching stock group already exists. Add or manage unit variants from the existing stock group.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: "Failed to create product" },
      { status: 500 }
    );
  }
}

// DELETE /api/products?ids=a,b,c — bulk delete by ID
// Per-product soft/hard rule: hard delete if never sold, soft delete (isActive=false) if it has transactions.
export async function DELETE(request: Request) {
  try {
    const user = await requirePermission("product", "delete");
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids") || "";
    const productIds = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

    if (productIds.length === 0) {
      return NextResponse.json(
        { message: "Validation error", errors: { ids: ["At least one product id is required"] } },
        { status: 422 }
      );
    }

    const storeId = user.storeId || "store-main";

    const products = await db.product.findMany({
      where: { id: { in: productIds }, storeId },
      select: { id: true },
    });

    if (products.length !== productIds.length) {
      return NextResponse.json(
        { message: "Some products not found or do not belong to your store" },
        { status: 404 }
      );
    }

    // Per-product delete so each product follows the same soft/hard rule as single delete.
    // Fail-soft: one product failing (e.g. FK conflict) is reported as an error, others still processed.
    const results: Array<{
      id: string;
      status: "hard_deleted" | "soft_deleted" | "error";
      message?: string;
    }> = [];

    for (const id of productIds) {
      try {
        const transactionsCount = await db.transactionItem.count({
          where: { productId: id },
        });

        if (transactionsCount > 0) {
          await db.product.update({
            where: { id },
            data: { isActive: false },
          });
          results.push({ id, status: "soft_deleted" });
        } else {
          await db.product.delete({ where: { id } });
          results.push({ id, status: "hard_deleted" });
        }
      } catch (itemError) {
        log.error(`Failed to delete product ${id}:`, itemError);
        results.push({
          id,
          status: "error",
          message:
            itemError instanceof Error
              ? itemError.message
              : "Failed to delete product",
        });
      }
    }

    const hardDeleted = results.filter((r) => r.status === "hard_deleted").length;
    const softDeleted = results.filter((r) => r.status === "soft_deleted").length;
    const failed = results.filter((r) => r.status === "error").length;

    return NextResponse.json(
      {
        results,
        summary: {
          total: results.length,
          hardDeleted,
          softDeleted,
          failed,
        },
      },
      { status: failed > 0 ? 207 : 200 }
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to bulk-delete products:", error);
    return NextResponse.json(
      { message: "Failed to delete products" },
      { status: 500 }
    );
  }
}



