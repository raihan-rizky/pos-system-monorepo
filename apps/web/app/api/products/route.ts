import { loadProductBaseCosts } from "@/features/customer-category-pricing/helpers/base-cost";
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
  shouldMarkConversionForReview,
} from "@/features/product-stock-groups/product-stock-groups-service";
import { normalizeStockGroupKey } from "@/features/product-stock-groups/stock-grouping";
import {
  isStockMutationConflict,
  lockStockMutationRows,
  StockMutationConflictError,
} from "@/features/product-stock-groups/stock-group-lock";
import { groupProductsByNameAndCategory } from "@/features/pos-search/services/product-grouping-service";
import { normalizeProductUnitGroup } from "@/lib/product-form/product-unit-variants";

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
  additionalUnitVariants: z.array(z.object({
    unit: z.string().trim().min(1, "Isi nama unit tambahan."),
    sku: z.string().trim().min(1, "Isi SKU unit tambahan."),
    relativeQuantity: z.coerce.number().finite().positive("Konversi unit harus berupa angka positif."),
    price: z.coerce.number().finite().min(0, "Harga jual tidak boleh negatif."),
    barcode: z.string().optional().nullable(),
    costPrice: z.coerce.number().finite().min(0, "HPP tidak boleh negatif.").optional().nullable(),
  })).optional(),
  smallestUnitVariant: z.object({
    unit: z.string().trim().min(1),
    sku: z.string().trim().min(1),
    barcode: z.string().optional().nullable(),
    price: z.coerce.number().min(0),
    costPrice: z.coerce.number().optional().nullable(),
    multiplierFromPackaging: z.coerce.number().positive(),
  }).optional(),
}).superRefine((value, ctx) => {
  if (value.additionalUnitVariants && value.smallestUnitVariant) {
    ctx.addIssue({ code: "custom", path: ["additionalUnitVariants"], message: "Gunakan satu cara untuk menambahkan unit." });
  }
  if (value.additionalUnitVariants?.length) {
    const skus = new Set([value.sku.trim().toUpperCase()]);
    value.additionalUnitVariants.forEach((variant, index) => {
      const sku = variant.sku.toUpperCase();
      if (skus.has(sku)) ctx.addIssue({ code: "custom", path: ["additionalUnitVariants", index, "sku"], message: "SKU sudah digunakan. Pilih SKU yang berbeda." });
      skus.add(sku);
    });
    try {
      normalizeProductUnitGroup(value.unit, value.stock, value.additionalUnitVariants);
    } catch (error) {
      ctx.addIssue({ code: "custom", path: ["additionalUnitVariants"], message: error instanceof Error ? error.message : "Periksa konversi unit." });
    }
  }
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
    const unit = searchParams.get("unit")?.trim() || "";
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
      ...(unit && { unit: { equals: unit, mode: "insensitive" as const } }),
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

    const baseCosts = await loadProductBaseCosts(db, products);
    const rawProducts = products.map((product) => ({ ...withCalculatedStock(product), ...baseCosts.get(product.id) }));
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

    for (const variant of validatedData.additionalUnitVariants ?? []) {
      if (await db.product.findUnique({ where: { sku: variant.sku } })) {
        return NextResponse.json({ message: `SKU ${variant.sku} sudah digunakan. Ubah SKU di Detail tambahan.` }, { status: 409 });
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
      const { additionalUnitVariants: _additionalVariants, ...legacyData } = validatedData;
      if (validatedData.additionalUnitVariants?.length) {
        const { additionalUnitVariants, smallestUnitVariant: _legacyVariant, ...primaryData } = validatedData;
        const normalized = normalizeProductUnitGroup(primaryData.unit, primaryData.stock, additionalUnitVariants);
        const groupKey = normalizeStockGroupKey(primaryData);
        const existingGroup = await tx.productStockGroup.findUnique({
          where: { storeId_groupKey: { storeId, groupKey } },
        });
        if (existingGroup) throw new Error("STOCK_GROUP_ALREADY_EXISTS");
        const group = await tx.productStockGroup.create({
          data: { storeId, groupKey, displayName: primaryData.name, baseUnit: normalized.baseUnit, baseStock: normalized.baseStock },
        });
        const original = await tx.product.create({
          data: { ...primaryData, unit: primaryData.unit.trim(), sku: primaryData.sku.trim(),
            stockGroupId: group.id, unitMultiplierToBase: normalized.primaryMultiplier,
            conversionNeedsReview: false, storeId },
          include: {
            category: { select: { id: true, name: true, icon: true, color: true } },
            brand: { select: { id: true, name: true, normalizedName: true } },
            stockGroup: { select: { id: true, groupKey: true, displayName: true, baseUnit: true, baseStock: true } },
          },
        });
        const products = [original];
        for (const [index, variant] of additionalUnitVariants.entries()) {
          const multiplier = normalized.additionalMultipliers[index];
          products.push(await tx.product.create({
            data: {
              name: primaryData.name, description: primaryData.description,
              categoryId: primaryData.categoryId, brandId: primaryData.brandId,
              imageUrl: primaryData.imageUrl, material: primaryData.material, size: primaryData.size,
              minStock: primaryData.minStock, unit: variant.unit, sku: variant.sku, barcode: variant.barcode,
              price: variant.price, costPrice: variant.costPrice ?? null,
              stock: normalized.baseStock / multiplier, unitMultiplierToBase: multiplier,
              stockGroupId: group.id, conversionNeedsReview: false, storeId,
            },
            include: {
              category: { select: { id: true, name: true, icon: true, color: true } },
              brand: { select: { id: true, name: true, normalizedName: true } },
              stockGroup: { select: { id: true, groupKey: true, displayName: true, baseUnit: true, baseStock: true } },
            },
          }));
        }
        const priceLogEntries = products.flatMap((created) => buildProductPriceLogEntries({
          productId: created.id, storeId, before: null,
          after: { price: created.price, costPrice: created.costPrice },
          actor: user, source: "MANUAL",
        }));
        if (priceLogEntries.length) await tx.productPriceLog.createMany({ data: priceLogEntries });
        await tx.productStockGroupActivity?.create({
          data: {
            stockGroupId: group.id, type: "PAIRED_VARIANTS_CREATED", productId: original.id,
            note: `Unit produk dibuat: ${[primaryData.unit, ...additionalUnitVariants.map((variant) => variant.unit)].join(", ")}`,
            createdBy: user.id, person: user.name ?? null,
            after: { baseUnit: normalized.baseUnit, baseStock: normalized.baseStock,
              variants: products.map((created) => ({ id: created.id, unit: created.unit, unitMultiplierToBase: created.unitMultiplierToBase })) },
          },
        });
        return original;
      }
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
              select: { id: true, stockGroupId: true, unit: true },
            },
          },
        });
        if (existingGroup) throw new Error("STOCK_GROUP_ALREADY_EXISTS");

        const baseStock = Number(validatedData.stock ?? 0) * multiplier;
        const group = await tx.productStockGroup.create({
          data: {
            storeId,
            groupKey,
            displayName: validatedData.name,
            baseUnit: smallest.unit,
            baseStock,
          },
        });
        const { smallestUnitVariant: _smallestUnitVariant, ...packagingData } =
          legacyData;

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
      const groupKey = normalizeStockGroupKey({
        name: validatedData.name,
        categoryId: validatedData.categoryId,
        material: validatedData.material,
        size: validatedData.size,
      });
      const groupHint = await tx.productStockGroup.findUnique({
        where: { storeId_groupKey: { storeId, groupKey } },
        include: {
          products: {
            where: { isActive: true },
            select: { id: true, stockGroupId: true },
          },
        },
      });

      let group = groupHint;
      if (groupHint) {
        const candidateProductIds = groupHint.products
          .map((existing) => existing.id)
          .sort((left, right) => left.localeCompare(right));
        const locks = await lockStockMutationRows(tx, {
          storeId,
          stockGroupIds: [groupHint.id],
          productIds: candidateProductIds,
        });
        if (
          locks.lockedStockGroupIds.length !== 1 ||
          locks.lockedProductIds.length !== candidateProductIds.length
        ) {
          throw new StockMutationConflictError();
        }

        group = await tx.productStockGroup.findUnique({
          where: { storeId_groupKey: { storeId, groupKey } },
          include: {
            products: {
              where: { isActive: true },
              select: { id: true, stockGroupId: true },
            },
          },
        });
        if (!group || group.id !== groupHint.id) {
          throw new StockMutationConflictError();
        }

        const reloadedProductIds = group.products
          .map((existing) => existing.id)
          .sort((left, right) => left.localeCompare(right));
        if (
          reloadedProductIds.length !== candidateProductIds.length ||
          reloadedProductIds.some(
            (productId, index) => productId !== candidateProductIds[index],
          ) ||
          group.products.some(
            (existing) => existing.stockGroupId !== groupHint.id,
          )
        ) {
          throw new StockMutationConflictError();
        }
      } else {
        group = await tx.productStockGroup.create({
          data: {
            storeId,
            groupKey,
            displayName: validatedData.name,
            baseUnit: validatedData.unit,
            baseStock,
          },
          include: {
            products: {
              where: { isActive: true },
              select: { id: true, stockGroupId: true },
            },
          },
        });
      }
      const groupCreated = groupHint === null;

      const created = await tx.product.create({
        data: {
          ...legacyData,
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
        { message: error.issues[0]?.message || "Periksa data produk dan unitnya.", errors: error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    if (error instanceof Error && error.message === "STOCK_GROUP_ALREADY_EXISTS") {
      return NextResponse.json(
        {
          message:
            "Grup stok produk ini sudah ada. Tambahkan atau atur unit dari grup stok tersebut.",
        },
        { status: 409 },
      );
    }
    if (
      isStockMutationConflict(error) ||
      (error &&
        typeof error === "object" &&
        (error as { code?: unknown }).code === "P2002")
    ) {
      return NextResponse.json(
        {
          message:
            "Data grup stok berubah saat produk dibuat. Silakan coba lagi.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: "Produk belum berhasil disimpan. Silakan coba lagi." },
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
    const productIds = Array.from(
      new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean)),
    );

    if (productIds.length === 0) {
      return NextResponse.json(
        { message: "Validation error", errors: { ids: ["At least one product id is required"] } },
        { status: 422 }
      );
    }

    const storeId = user.storeId || "store-main";
    const existingProducts = await db.product.findMany({
      where: { id: { in: productIds }, storeId },
      select: { id: true },
    });
    if (existingProducts.length !== productIds.length) {
      throw new Error("PRODUCT_NOT_FOUND");
    }

    const results: Array<{
      id: string;
      status: "hard_deleted" | "soft_deleted" | "error";
      message?: string;
    }> = [];
    for (const id of productIds) {
      try {
        const status = await db.$transaction(async (tx) => {
          const productHint = await tx.product.findFirst({
            where: { id, storeId },
            select: { id: true, stockGroupId: true, isActive: true },
          });
          if (!productHint) throw new Error("PRODUCT_NOT_FOUND");

          const locks = await lockStockMutationRows(tx, {
            storeId,
            stockGroupIds: productHint.stockGroupId
              ? [productHint.stockGroupId]
              : [],
            productIds: [productHint.id],
          });
          if (
            !locks.lockedProductIds.includes(productHint.id) ||
            (productHint.stockGroupId &&
              !locks.lockedStockGroupIds.includes(
                productHint.stockGroupId,
              ))
          ) {
            throw new StockMutationConflictError();
          }

          const currentProduct = await tx.product.findFirst({
            where: { id, storeId },
            select: { id: true, stockGroupId: true, isActive: true },
          });
          if (
            !currentProduct ||
            currentProduct.stockGroupId !== productHint.stockGroupId ||
            currentProduct.isActive !== productHint.isActive
          ) {
            throw new StockMutationConflictError();
          }

          const transactionsCount = await tx.transactionItem.count({
            where: { productId: id },
          });
          if (transactionsCount > 0) {
            await tx.product.update({
              where: { id },
              data: { isActive: false },
            });
            return "soft_deleted" as const;
          }

          await tx.product.delete({ where: { id } });
          return "hard_deleted" as const;
        });
        results.push({ id, status });
      } catch (itemError) {
        if (
          isStockMutationConflict(itemError) ||
          (itemError instanceof Error &&
            itemError.message === "PRODUCT_NOT_FOUND")
        ) {
          throw itemError;
        }
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
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
      return NextResponse.json(
        { message: "Some products not found or do not belong to your store" },
        { status: 404 },
      );
    }
    if (isStockMutationConflict(error)) {
      return NextResponse.json(
        {
          message:
            "Data produk atau grup stok berubah saat dihapus. Silakan coba lagi.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: "Failed to delete products" },
      { status: 500 }
    );
  }
}



