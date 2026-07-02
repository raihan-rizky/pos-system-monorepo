import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

import { z } from "zod";

import { getLogger } from "@/lib/logger";
import { buildProductPriceLogEntries } from "@/lib/product-price-logs/price-log-entries";
import { withCalculatedStock } from "@/features/product-stock-groups/stock-display";
import {
  buildStockGroupCreateData,
  ensureProductStockGroup,
  resolveGroupedStockUpdate,
  shouldMarkConversionForReview,
} from "@/features/product-stock-groups/product-stock-groups-service";

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
  imageUrl: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  priceChangeNote: z.string().optional().nullable(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("product", "update");
    const { id } = await params;
    const storeId = user.storeId || "store-main";
    const body = await request.json();
    
    const { priceChangeNote, ...validatedData } = updateProductSchema.parse(body);

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

    const product = await db.$transaction(async (tx) => {
      const nextName = validatedData.name ?? existingProduct.name;
      const nextCategoryId = validatedData.categoryId ?? existingProduct.categoryId;
      const nextMaterial = validatedData.material ?? existingProduct.material;
      const nextSize = validatedData.size ?? existingProduct.size;
      const nextUnit = validatedData.unit ?? existingProduct.unit;
      const currentMultiplier = existingProduct.unitMultiplierToBase ?? 1;
      const nextMultiplier =
        validatedData.unitMultiplierToBase ?? currentMultiplier;
      const currentDisplayStock = existingProduct.stockGroup
        ? existingProduct.stockGroup.baseStock / currentMultiplier
        : existingProduct.stock;
      const requestedStock = validatedData.stock;
      const { baseStock } = buildStockGroupCreateData({
        unitMultiplierToBase: nextMultiplier,
        stock: requestedStock ?? currentDisplayStock,
      });
      const { group, created: groupCreated } = await ensureProductStockGroup(tx, {
        storeId,
        name: nextName,
        categoryId: nextCategoryId,
        material: nextMaterial,
        size: nextSize,
        displayName: nextName,
        baseUnit: nextUnit,
        baseStock,
      });
      const shouldUseGroupedStock = Boolean(group.id);
      const productData = {
        ...validatedData,
        ...(shouldUseGroupedStock ? { stock: undefined } : {}),
        stockGroupId: group.id,
        unitMultiplierToBase: nextMultiplier,
        conversionNeedsReview:
          validatedData.unitMultiplierToBase !== undefined
            ? false
            : group.id === existingProduct.stockGroupId
              ? existingProduct.conversionNeedsReview
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
        productId: updated.id,
        storeId,
        before: {
          price: existingProduct.price,
          costPrice: existingProduct.costPrice,
        },
        after: {
          price: updated.price,
          costPrice: updated.costPrice,
        },
        actor: user,
        source: "MANUAL",
        note: priceChangeNote,
      });

      if (priceLogEntries.length > 0) {
        await tx.productPriceLog.createMany({ data: priceLogEntries });
      }

      return updated;
    });

    return NextResponse.json(withCalculatedStock(product));
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to update product:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.flatten().fieldErrors },
        { status: 422 }
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
    const existingProduct = await db.product.findFirst({
      where: { id, storeId },
      select: { id: true },
    });

    if (!existingProduct) {
      return NextResponse.json(
        { message: "Product not found" },
        { status: 404 }
      );
    }
    
    // Check if product is in any transactions
    const transactionsCount = await db.transactionItem.count({
      where: { productId: existingProduct.id },
    });

    if (transactionsCount > 0) {
      // Soft delete by setting isActive to false
      await db.product.update({
        where: { id: existingProduct.id },
        data: { isActive: false },
      });
      return new NextResponse(null, { status: 204 });
    }

    // Hard delete if it has never been sold
    await db.product.delete({
      where: { id: existingProduct.id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to delete product:", error);
    return NextResponse.json(
      { message: "Failed to delete product" },
      { status: 500 }
    );
  }
}
