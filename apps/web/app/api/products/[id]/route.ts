import { loadProductBaseCosts } from "@/features/customer-category-pricing/helpers/base-cost";
import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

import { z } from "zod";

import { getLogger } from "@/lib/logger";
import { buildProductPriceLogEntries } from "@/lib/product-price-logs/price-log-entries";
import { withCalculatedStock } from "@/features/product-stock-groups/stock-display";
import {
  buildStockGroupCreateData,
  resolveGroupedStockUpdate,
  shouldMarkConversionForReview,
} from "@/features/product-stock-groups/product-stock-groups-service";
import { normalizeStockGroupKey } from "@/features/product-stock-groups/stock-grouping";
import { stockGroupKeyForCategory } from "@/features/product-stock-groups/group-category";
import {
  isStockMutationConflict,
  lockStockMutationRows,
  StockMutationConflictError,
} from "@/features/product-stock-groups/stock-group-lock";

import { initializeGroupPricing } from "@/features/product-stock-groups/automatic-pricing";
import { GroupPricingError, prepareGroupPricingMutation, seedNewGroupPricingMutation, synchronizeGroupPricingMutation } from "@/features/product-stock-groups/group-pricing-service";

const log = getLogger("api:products:id");
const updateProductSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  sku: z.string().min(1, "SKU is required").optional(),
  barcode: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "Price must be >= 0").optional(),
  costPrice: z.coerce.number().optional().nullable(),
  hargaDinas: z.coerce.number().min(0, "Harga Dinas must be >= 0").optional().nullable(),
  hargaAgen: z.coerce.number().min(0, "Harga Agen must be >= 0").optional().nullable(),
  stock: z.coerce.number().optional(),
  unitMultiplierToBase: z.coerce.number().positive().optional(),
  minStock: z.coerce.number().optional(),
  unit: z.string().optional(),
  size: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  categoryId: z.string().optional(),
  brandId: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  priceChangeNote: z.string().optional().nullable(),
  quickEditGroup: z.boolean().optional(),
  pricingMode: z.enum(["AUTO", "MANUAL"]).optional(),
});

async function findStoreBrand(brandId: string | null | undefined, storeId: string) {
  if (!brandId) return null;
  return db.brand.findFirst({
    where: { id: brandId, storeId },
    select: { id: true, name: true, normalizedName: true },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("product", "read");
    const { id } = await params;
    const product = await db.product.findFirst({
      where: { id, storeId: user.storeId || "store-main", isActive: true },
      include: { category: true, brand: true, stockGroup: true },
    });
    if (!product) return NextResponse.json({ message: "Produk tidak ditemukan" }, { status: 404 });
    const baseCosts = await loadProductBaseCosts(db, [product]);
    return NextResponse.json({ data: { ...withCalculatedStock(product), ...baseCosts.get(product.id) } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Failed to fetch product:", error);
    return NextResponse.json({ message: "Produk belum dapat dimuat. Coba lagi." }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("product", "update");
    const { id } = await params;
    const storeId = user.storeId || "store-main";
    const body = await request.json();
    
    const { priceChangeNote, quickEditGroup, pricingMode, ...validatedData } = updateProductSchema.parse(body);

    if (validatedData.sku) {
      const existingProduct = await db.product.findFirst({
        where: { sku: validatedData.sku, storeId },
      });
      if (existingProduct && existingProduct.id !== id) {
        return NextResponse.json(
          { message: "SKU already exists on another product." },
          { status: 409 }
        );
      }
    }

    const existingProduct = await db.product.findFirst({
      where: { id, storeId },
      include: { stockGroup: true },
    });

    if (!existingProduct) {
      return NextResponse.json(
        { message: "Product not found" },
        { status: 404 }
      );
    }

    const selectedBrand = await findStoreBrand(validatedData.brandId, storeId);
    if (validatedData.brandId && !selectedBrand) {
      return NextResponse.json(
        { message: "Merek tidak ditemukan" },
        { status: 404 },
      );
    }

    if (quickEditGroup) {
      if (!validatedData.name || !validatedData.categoryId) {
        return NextResponse.json(
          { message: "Nama Produk dan Kategori wajib diisi." },
          { status: 422 },
        );
      }
      const groupName = validatedData.name;
      const groupCategoryId = validatedData.categoryId;

      const category = await db.category.findFirst({
        where: { id: groupCategoryId },
        select: { id: true, name: true, icon: true, color: true },
      });
      if (!category) {
        return NextResponse.json(
          { message: "Kategori tidak ditemukan" },
          { status: 404 },
        );
      }

      try {
        const productIds = await db.$transaction(async (tx) => {
          const groupWhere = existingProduct.stockGroupId
            ? { storeId, stockGroupId: existingProduct.stockGroupId }
            : { storeId, id: existingProduct.id };
          const groupProductHints = await tx.product.findMany({
            where: groupWhere,
            select: { id: true, stockGroupId: true },
          });
          const groupProductIds = groupProductHints
            .map((product) => product.id)
            .sort();
          if (groupProductIds.length === 0) {
            throw new Error("QUICK_EDIT_GROUP_NOT_FOUND");
          }

          const locks = await lockStockMutationRows(tx, {
            storeId,
            stockGroupIds: existingProduct.stockGroupId
              ? [existingProduct.stockGroupId]
              : [],
            productIds: groupProductIds,
          });
          if (
            locks.lockedProductIds.length !== groupProductIds.length ||
            (existingProduct.stockGroupId &&
              !locks.lockedStockGroupIds.includes(
                existingProduct.stockGroupId,
              ))
          ) {
            throw new StockMutationConflictError();
          }

          const groupProducts = await tx.product.findMany({
            where: groupWhere,
            select: { id: true, stockGroupId: true, name: true, categoryId: true, material: true, size: true },
          });
          const currentIds = groupProducts
            .map((product) => product.id)
            .sort();
          const hintById = new Map(
            groupProductHints.map((product) => [product.id, product]),
          );
          if (
            currentIds.length !== groupProductIds.length ||
            currentIds.some(
              (productId, index) => productId !== groupProductIds[index],
            ) ||
            groupProducts.some(
              (product) =>
                hintById.get(product.id)?.stockGroupId !==
                product.stockGroupId,
            )
          ) {
            throw new StockMutationConflictError();
          }

          const selectedProduct = groupProducts.find(
            (product) => product.id === existingProduct.id,
          );
          if (!selectedProduct || selectedProduct.stockGroupId !== existingProduct.stockGroupId ||
              selectedProduct.categoryId !== existingProduct.categoryId) {
            throw new StockMutationConflictError();
          }

          const categoryChanged = groupCategoryId !== existingProduct.categoryId;
          const changeName = !categoryChanged || groupName !== existingProduct.name;
          const changeBrand = validatedData.brandId !== undefined &&
            (!categoryChanged || validatedData.brandId !== (existingProduct.brandId ?? null));
          const changeDescription = validatedData.description !== undefined;

          if (existingProduct.stockGroupId) {
            const currentGroupKey = existingProduct.stockGroup?.groupKey;
            if (!currentGroupKey) throw new StockMutationConflictError();
            const nextGroupKey = currentGroupKey.startsWith("manual:")
              ? currentGroupKey
              : categoryChanged && !changeName
                ? stockGroupKeyForCategory(currentGroupKey, groupProducts, groupCategoryId)
                : normalizeStockGroupKey({
                  name: groupName,
                  categoryId: groupCategoryId,
                  material: existingProduct.material,
                  size: existingProduct.size,
                });
            const collision = await tx.productStockGroup.findFirst({
              where: {
                storeId,
                groupKey: nextGroupKey,
                NOT: { id: existingProduct.stockGroupId },
              },
              select: { id: true },
            });
            if (collision) throw new Error("QUICK_EDIT_GROUP_COLLISION");

            await tx.productStockGroup.update({
              where: { id: existingProduct.stockGroupId },
              data: {
                groupKey: nextGroupKey,
                ...(changeName ? { displayName: groupName } : {}),
              },
            });
          }

          await tx.product.updateMany({
            where: { id: { in: groupProductIds }, storeId },
            data: {
              ...(changeName ? { name: groupName } : {}),
              categoryId: groupCategoryId,
              ...(changeBrand ? { brandId: validatedData.brandId } : {}),
              ...(changeDescription ? { description: validatedData.description } : {}),
            },
          });

          return groupProductIds;
        });

        return NextResponse.json({
          productIds,
          name: groupName,
          description: validatedData.description !== undefined
            ? validatedData.description
            : existingProduct.description ?? null,
          category,
          brand: selectedBrand,
        });
      } catch (groupError) {
        if (
          groupError instanceof Error &&
          groupError.message === "QUICK_EDIT_GROUP_COLLISION"
        ) {
          return NextResponse.json(
            { message: "Nama dan kategori tersebut sudah digunakan oleh grup produk lain." },
            { status: 409 },
          );
        }
        if (
          groupError instanceof Error &&
          groupError.message === "QUICK_EDIT_GROUP_NOT_FOUND"
        ) {
          return NextResponse.json(
            { message: "Grup produk tidak lagi tersedia." },
            { status: 404 },
          );
        }
        throw groupError;
      }
    }

    const product = await db.$transaction(async (tx) => {
      const hintedNextName = validatedData.name ?? existingProduct.name;
      const hintedNextCategoryId =
        validatedData.categoryId ?? existingProduct.categoryId;
      const hintedNextMaterial =
        validatedData.material ?? existingProduct.material;
      const hintedNextSize = validatedData.size ?? existingProduct.size;
      const targetGroupKey = normalizeStockGroupKey({
        name: hintedNextName,
        categoryId: hintedNextCategoryId,
        material: hintedNextMaterial,
        size: hintedNextSize,
      });
      const changingGroupCategory = Boolean(existingProduct.stockGroupId) &&
        validatedData.categoryId !== undefined && validatedData.categoryId !== existingProduct.categoryId;
      const retainCurrentGroup = Boolean(existingProduct.stockGroupId) && (changingGroupCategory || targetGroupKey === normalizeStockGroupKey({
        name: existingProduct.name, categoryId: existingProduct.categoryId,
        material: existingProduct.material, size: existingProduct.size,
      }));
      const targetGroupHint = retainCurrentGroup ? existingProduct.stockGroup : await tx.productStockGroup.findUnique({
        where: {
          storeId_groupKey: { storeId, groupKey: targetGroupKey },
        },
      });

      const candidateGroupIds = [
        ...(existingProduct.stockGroupId
          ? [existingProduct.stockGroupId]
          : []),
        ...(targetGroupHint ? [targetGroupHint.id] : []),
      ];
      const prepared = await prepareGroupPricingMutation(tx, { storeId, groupIds: candidateGroupIds, extraProductIds: [existingProduct.id] });
      const currentProduct = await tx.product.findFirst({
        where: { id: existingProduct.id, storeId },
        include: { stockGroup: true },
      });
      if (
        !currentProduct ||
        currentProduct.stockGroupId !== existingProduct.stockGroupId ||
        (validatedData.categoryId !== undefined && currentProduct.categoryId !== existingProduct.categoryId)
      ) {
        throw new StockMutationConflictError();
      }

      const nextName = validatedData.name ?? currentProduct.name;
      const nextCategoryId =
        validatedData.categoryId ?? currentProduct.categoryId;
      const nextMaterial = validatedData.material ?? currentProduct.material;
      const nextSize = validatedData.size ?? currentProduct.size;
      const nextUnit = validatedData.unit ?? currentProduct.unit;
      const currentTargetGroupKey = normalizeStockGroupKey({
        name: nextName,
        categoryId: nextCategoryId,
        material: nextMaterial,
        size: nextSize,
      });
      if (currentTargetGroupKey !== targetGroupKey) {
        throw new StockMutationConflictError();
      }
      if (changingGroupCategory && currentTargetGroupKey !== normalizeStockGroupKey({
        name: currentProduct.name,
        categoryId: nextCategoryId,
        material: currentProduct.material,
        size: currentProduct.size,
      })) {
        throw new GroupPricingError("Ubah kategori dan identitas produk secara terpisah agar seluruh satuan tetap dalam grup yang benar.", 409);
      }

      const targetGroup = retainCurrentGroup ? await tx.productStockGroup.findFirst({
        where: { id: currentProduct.stockGroupId!, storeId },
      }) : await tx.productStockGroup.findUnique({
        where: {
          storeId_groupKey: { storeId, groupKey: targetGroupKey },
        },
      });
      if (targetGroupHint?.id !== targetGroup?.id) {
        throw new StockMutationConflictError();
      }

      if (!currentProduct.stockGroupId && validatedData.categoryId !== undefined &&
          validatedData.categoryId !== currentProduct.categoryId && targetGroup) {
        throw new GroupPricingError("Kategori tujuan sudah memiliki grup stok dengan identitas yang sama. Periksa grup sebelum memindahkan produk.", 409);
      }

      const currentMultiplier = currentProduct.unitMultiplierToBase ?? 1;
      const nextMultiplier =
        validatedData.unitMultiplierToBase ?? currentMultiplier;
      const currentDisplayStock = currentProduct.stockGroup
        ? currentProduct.stockGroup.baseStock / currentMultiplier
        : currentProduct.stock;
      const requestedStock = validatedData.stock;
      const { baseStock } = buildStockGroupCreateData({
        unitMultiplierToBase: nextMultiplier,
        stock: requestedStock ?? currentDisplayStock,
      });
      const group =
        targetGroup ??
        (await tx.productStockGroup.create({
          data: {
            storeId,
            groupKey: targetGroupKey,
            displayName: nextName,
            baseUnit: nextUnit,
            baseStock,
          },
        }));
      const groupCreated = targetGroup === null;
      if (changingGroupCategory && currentProduct.stockGroupId) {
        const groupMembers = await tx.product.findMany({
          where: { storeId, stockGroupId: group.id },
          select: { name: true, categoryId: true, material: true, size: true },
          orderBy: { id: "asc" },
        });
        const nextGroupKey = stockGroupKeyForCategory(group.groupKey, groupMembers, nextCategoryId);
        if (nextGroupKey !== group.groupKey) {
          const collision = await tx.productStockGroup.findUnique({
            where: { storeId_groupKey: { storeId, groupKey: nextGroupKey } },
            select: { id: true },
          });
          if (collision && collision.id !== group.id) {
            throw new GroupPricingError("Kategori tujuan sudah memiliki grup stok dengan identitas yang sama. Periksa grup sebelum memindahkan produk.", 409);
          }
          try {
            await tx.productStockGroup.update({ where: { id: group.id }, data: { groupKey: nextGroupKey } });
          } catch (error) {
            if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
              throw new GroupPricingError("Kategori tujuan sudah memiliki grup stok dengan identitas yang sama. Periksa grup sebelum memindahkan produk.", 409);
            }
            throw error;
          }
        }
        await tx.product.updateMany({ where: { storeId, stockGroupId: group.id }, data: { categoryId: nextCategoryId } });
      }
      const shouldUseGroupedStock = Boolean(group.id);
      const productData = {
        ...validatedData,
        ...(shouldUseGroupedStock ? { stock: undefined } : {}),
        stockGroupId: group.id,
        unitMultiplierToBase: nextMultiplier,
        conversionNeedsReview:
          validatedData.unitMultiplierToBase !== undefined && (!changingGroupCategory || nextMultiplier !== currentMultiplier)
            ? false
            : group.id === currentProduct.stockGroupId
              ? currentProduct.conversionNeedsReview
              : shouldMarkConversionForReview({
                  groupCreated,
                  unitMultiplierProvided: false,
                  unit: nextUnit,
                  baseUnit: group.baseUnit,
                }),
      };

      const nextBaseStock = resolveGroupedStockUpdate({
        requestedDisplayStock: requestedStock,
        multiplier: nextMultiplier,
      });
      if (nextBaseStock !== undefined) {
        await tx.productStockGroup.update({
          where: { id: group.id },
          data: { baseStock: nextBaseStock },
        });
      }

      const updated = await tx.product.update({
        where: { id: existingProduct.id },
        data: productData,
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

      if (validatedData.description !== undefined) {
        await tx.product.updateMany({
          where: { storeId, stockGroupId: group.id },
          data: { description: validatedData.description },
        });
      }

      if (groupCreated) await seedNewGroupPricingMutation(tx, { prepared, groupId: group.id });
      if (group.id !== currentProduct.stockGroupId) {
        const targetBefore = prepared.before.get(group.id)!;
        // Freeze legacy factors before adding the incoming product's money
        // preimage. Its missing config entry gives the new follower factor one.
        targetBefore.config = initializeGroupPricing(targetBefore).config;
        targetBefore.members = targetBefore.members.filter(member => member.id !== currentProduct.id);
        targetBefore.members.push({
          id: currentProduct.id, storeId, groupId: group.id, unit: nextUnit,
          unitMultiplierToBase: nextMultiplier, isActive: currentProduct.isActive,
          conversionNeedsReview: productData.conversionNeedsReview,
          price: currentProduct.price.toString(), costPrice: currentProduct.costPrice?.toString() ?? null,
        });
      }
      const priceChanged = validatedData.price !== undefined && Number(validatedData.price) !== Number(currentProduct.price);
      const costChanged = validatedData.costPrice !== undefined && (
        validatedData.costPrice === null
          ? currentProduct.costPrice !== null
          : currentProduct.costPrice === null || Number(validatedData.costPrice) !== Number(currentProduct.costPrice)
      );
      const memberIntent = {
        productId: updated.id,
        mode: pricingMode,
        price: changingGroupCategory && !priceChanged ? undefined : validatedData.price,
        costPrice: changingGroupCategory && !costChanged ? undefined : validatedData.costPrice,
      };
      const hasPricingIntent = pricingMode !== undefined || memberIntent.price !== undefined || memberIntent.costPrice !== undefined;
      const pricingRelevantChange = hasPricingIntent || nextMultiplier !== currentMultiplier ||
        nextUnit !== currentProduct.unit ||
        (validatedData.isActive !== undefined && validatedData.isActive !== currentProduct.isActive) ||
        productData.conversionNeedsReview !== currentProduct.conversionNeedsReview;
      if (!changingGroupCategory || pricingRelevantChange) {
        await synchronizeGroupPricingMutation(tx, {
          prepared, actor: user, source: "MANUAL", note: priceChangeNote, allowInactiveMembers: true,
          changes: hasPricingIntent ? {
            [group.id]: { members: [memberIntent] },
          } : undefined,
        });
      }
      const persisted = await tx.product.findFirst({ where: { id: updated.id, storeId }, include: { category: true, brand: true, stockGroup: true } });
      if (!persisted) throw new StockMutationConflictError();
      const priceLogEntries = buildProductPriceLogEntries({
        productId: updated.id,
        storeId,
        before: {
          price: currentProduct.price,
          costPrice: currentProduct.costPrice,
          hargaAgen: currentProduct.hargaAgen,
          hargaDinas: currentProduct.hargaDinas,
        },
        after: {
          price: updated.price,
          costPrice: updated.costPrice,
          hargaAgen: updated.hargaAgen,
          hargaDinas: updated.hargaDinas,
        },
        actor: user,
        source: "MANUAL",
        note: priceChangeNote,
      }).filter(entry => entry.field === "HARGA_AGEN" || entry.field === "HARGA_DINAS");

      if (priceLogEntries.length > 0) {
        await tx.productPriceLog.createMany({ data: priceLogEntries });
      }

      return persisted;
    });

    return NextResponse.json(withCalculatedStock(product));
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof GroupPricingError) return NextResponse.json({ message: error.message }, { status: error.status });
    log.error("Failed to update product:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    if (isStockMutationConflict(error)) {
      return NextResponse.json(
        {
          message:
            "Data produk atau grup stok berubah saat diproses. Silakan coba lagi.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: "Failed to update product" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("product", "delete");
    const { id } = await params;
    const storeId = user.storeId || "store-main";
    await db.$transaction(async (tx) => {
      const productHint = await tx.product.findFirst({
        where: { id, storeId },
        select: { id: true, stockGroupId: true, isActive: true },
      });
      if (!productHint) throw new Error("PRODUCT_NOT_FOUND");

      const prepared = await prepareGroupPricingMutation(tx, { storeId, groupIds: productHint.stockGroupId ? [productHint.stockGroupId] : [], extraProductIds: [productHint.id] });
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
        where: { productId: currentProduct.id },
      });

      if (transactionsCount > 0) {
        await tx.product.update({
          where: { id: currentProduct.id },
          data: { isActive: false },
        });
        await synchronizeGroupPricingMutation(tx, { prepared, actor: user, source: "MANUAL" });
        return;
      }

      await tx.product.delete({
        where: { id: currentProduct.id },
      });
      await synchronizeGroupPricingMutation(tx, { prepared, actor: user, source: "MANUAL" });
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof GroupPricingError) return NextResponse.json({ message: error.message }, { status: error.status });
    log.error("Failed to delete product:", error);
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
      return NextResponse.json({ message: "Product not found" }, { status: 404 });
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
      { message: "Failed to delete product" },
      { status: 500 }
    );
  }
}
